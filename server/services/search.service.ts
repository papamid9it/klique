import "server-only";
import { Types } from "mongoose";
import type { SearchHitDTO, SearchKind, CommunitySearchDTO } from "@/lib/types";
import { Channel, ChannelMessage, type IChannel, type IChannelMessage } from "../models/Channel";
import { Crew, type ICrew } from "../models/Crew";
import { Event, type IEvent } from "../models/Event";
import { FeedPost, type IFeedPost } from "../models/FeedPost";
import { Membership } from "../models/Membership";
import { Topic, type ITopic } from "../models/Topic";
import { User, type IUser } from "../models/User";
import { assertCanView } from "../policies/access";
import { loadBriefs } from "../serializers";
import { hiddenUserIds } from "./blocks";
import { listChannels } from "./channels.service";
import { escapeRegex, sid } from "./helpers";
import { resolveSpaceFor } from "./spaces.service";

/**
 * Search inside one community, Discord style: one box with free text plus filters
 *   from:@user  in:#channel  mentions:@user  has:image|video|link|sticker
 *   before:2026-10-01  after:2026-10-01  during:2026-10 (or a day)  pinned:true
 *   type:message|topic|post|event|klique|member
 * Free text uses MongoDB text indexes (made the first time a search runs). Only what the viewer may see: channels
 * they can read (private ones only with access; groups they're in), nothing from people they've blocked, and the
 * community itself only past its 18+ gate. Results come grouped by kind with counts; one kind pages on its own.
 */

export interface ParsedQuery {
  text: string;
  from: string[];
  in: string[];
  mentions: string[];
  has: string[];
  before: Date | null;
  after: Date | null;
  pinned: boolean;
  type: SearchKind | null;
}

const KINDS: SearchKind[] = ["message", "topic", "post", "event", "klique", "member"];
const DAY = 86_400_000;

/** Split the box into filters and free text. Unknown "x:y" words stay as text. */
export function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { text: "", from: [], in: [], mentions: [], has: [], before: null, after: null, pinned: false, type: null };
  const words: string[] = [];
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(from|in|mentions|has|before|after|during|pinned|type):(.+)$/i);
    if (!m) {
      words.push(token);
      continue;
    }
    const [, key, valueRaw] = m;
    const value = valueRaw.replace(/^[@#]/, "").toLowerCase();
    const date = (v: string) => (/^\d{4}-\d{2}(-\d{2})?$/.test(v) ? new Date(`${v.length === 7 ? `${v}-01` : v}T00:00:00+01:00`) : null);
    switch (key.toLowerCase()) {
      case "from": q.from.push(value); break;
      case "in": q.in.push(value); break;
      case "mentions": q.mentions.push(value); break;
      case "has": if (["image", "video", "link", "sticker"].includes(value)) q.has.push(value); break;
      case "before": q.before = date(value); break;
      case "after": q.after = date(value); break;
      case "during": {
        const d = date(value);
        if (d) {
          q.after = d;
          // a month: up to the 1st of the next one (Lagos time); a day: 24 hours
          const [y, mo] = value.split("-").map(Number);
          q.before = value.length === 7 ? new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1) - 3600_000) : new Date(+d + DAY);
        }
        break;
      }
      case "pinned": q.pinned = value === "true" || value === "yes"; break;
      case "type": if ((KINDS as string[]).includes(value)) q.type = value as SearchKind; break;
    }
  }
  q.text = words.join(" ").slice(0, 200);
  return q;
}

/** Text indexes, made once per server the first time anyone searches (a no-op when they're there already). */
let indexed: Promise<void> | null = null;
function ensureIndexes() {
  indexed ??= Promise.all([
    ChannelMessage.collection.createIndex({ body: "text" }, { name: "search_text", default_language: "none" }),
    Topic.collection.createIndex({ title: "text", body: "text", tags: "text" }, { name: "search_text", weights: { title: 5, tags: 3, body: 1 }, default_language: "none" }),
    FeedPost.collection.createIndex({ title: "text", caption: "text", tags: "text" }, { name: "search_text", weights: { title: 5, tags: 3, caption: 1 }, default_language: "none" }),
    Crew.collection.createIndex({ title: "text", note: "text", area: "text" }, { name: "search_text", weights: { title: 5, area: 2, note: 1 }, default_language: "none" }),
  ]).then(
    () => undefined,
    (e) => {
      console.warn("[search] couldn't make text indexes:", (e as Error).message);
      indexed = null;
    },
  );
  return indexed;
}

const PAGE = 20;
const PREVIEW = 4;

/** The bit of text around the first match, so the result shows why it matched. */
function snippetOf(text: string, words: string[], n = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!words.length) return t.slice(0, n);
  const lower = t.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0), Infinity);
  if (!Number.isFinite(at) || at < n / 2) return t.slice(0, n);
  return `…${t.slice(at - 40, at - 40 + n)}`;
}

export async function searchCommunity(viewer: IUser, slug: string, raw: string, opts: { type?: SearchKind | null; sort?: "relevance" | "newest"; page?: number } = {}): Promise<CommunitySearchDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  assertCanView(access, "this community");
  await ensureIndexes();
  const q = parseQuery(raw);
  const only = opts.type ?? q.type;
  const page = Math.max(1, opts.page ?? 1);
  const sort = opts.sort ?? (q.text ? "relevance" : "newest");
  const words = q.text.split(/\s+/).filter((w) => w.length > 1);
  const communityId = space.community._id;

  // people named in from: / mentions:, by handle
  const handles = [...new Set([...q.from, ...q.mentions])];
  const people = handles.length ? await User.find({ handle: { $in: handles } }).select("_id handle").lean<{ _id: Types.ObjectId; handle: string }[]>() : [];
  const idOf = (h: string) => people.find((p) => p.handle === h)?._id;
  const fromIds = q.from.map(idOf).filter((x): x is Types.ObjectId => !!x);
  const mentionIds = q.mentions.map(idOf).filter((x): x is Types.ObjectId => !!x);
  if ((q.from.length && !fromIds.length) || (q.mentions.length && !mentionIds.length)) return empty(q);
  const hidden = await hiddenUserIds(viewer._id);

  const dates = (field: string) => (q.before || q.after ? { [field]: { ...(q.after ? { $gte: q.after } : {}), ...(q.before ? { $lt: q.before } : {}) } } : {});
  const textFilter = q.text ? { $text: { $search: q.text } } : {};
  const authorFilter = (field: string) => ({ ...(fromIds.length ? { [field]: { $in: fromIds } } : hidden.length ? { [field]: { $nin: hidden } } : {}) });
  const sortBy = (dateField: string): Record<string, 1 | -1 | { $meta: "textScore" }> => (sort === "relevance" && q.text ? { score: { $meta: "textScore" }, [dateField]: -1 } : { [dateField]: -1 });
  const projection = q.text && sort === "relevance" ? { score: { $meta: "textScore" } } : {};
  const want = (k: SearchKind) => !only || only === k;
  // messages only make sense for these filters; topics and the rest don't have channels, mentions or pins
  const messageOnly = q.in.length > 0 || q.mentions.length > 0 || q.pinned || q.has.some((h) => h === "sticker");

  /* ---------------------------- messages ---------------------------- */
  // channels this viewer can read: the community's and the groups they're in (from the channel list), plus
  // post reply threads (topic channels) for anyone who can see the community
  const listed = await listChannels(viewer, space, access);
  const visible = [...listed.channels, ...listed.groups.flatMap((g) => g.channels.map((c) => ({ ...c, group: g.slug })))];
  const nameOf = new Map<string, { slug: string; name: string; sub: string | null }>(visible.map((c) => [c.id, { slug: c.slug, name: c.name, sub: (c as { group?: string }).group ?? null }]));
  const threads = await Channel.find({ communityId, topicId: { $ne: null }, subcommunityId: null }).select("_id topicId name").lean<Pick<IChannel, "_id" | "topicId" | "name">[]>();
  // threads off chat messages, in channels this viewer can read (in:#channel takes in its threads too)
  const chatThreads = await Channel.find({ communityId, parentChannelId: { $in: visible.map((c) => new Types.ObjectId(c.id)) } }).select("_id parentChannelId slug name").lean<Pick<IChannel, "_id" | "parentChannelId" | "slug" | "name">[]>();
  const parentOf = new Map(chatThreads.map((t) => [sid(t._id), t]));
  const inScope = (id: Types.ObjectId) => {
    const own = nameOf.get(sid(parentOf.get(sid(id))?.parentChannelId ?? id));
    return !!own && (q.in.includes(own.slug) || q.in.includes(own.name.toLowerCase()));
  };
  let channelIds = [...visible.map((c) => new Types.ObjectId(c.id)), ...threads.map((t) => t._id), ...chatThreads.map((t) => t._id)];
  if (q.in.length) channelIds = channelIds.filter(inScope);
  const hasFilter: Record<string, unknown>[] = [];
  for (const h of q.has) {
    // a regex on an array matches when any element does
    if (h === "image") hasFilter.push({ images: { $regex: /\.(jpe?g|png|webp|gif|avif|heic)(\?|#|$)/i } });
    if (h === "video") hasFilter.push({ images: { $regex: /\.(mp4|webm|mov|m4v)(\?|#|$)/i } });
    if (h === "link") hasFilter.push({ body: { $regex: /https?:\/\//i } });
    if (h === "sticker") hasFilter.push({ $or: [{ sticker: { $ne: null } }, { stickerUrl: { $ne: null } }] });
  }
  const messageFilter = {
    communityId,
    channelId: { $in: channelIds },
    deletedAt: null,
    hiddenAt: { $in: [null, undefined] },
    ...authorFilter("authorId"),
    ...(mentionIds.length ? { mentions: { $all: mentionIds } } : {}),
    ...(q.pinned ? { pinnedAt: { $ne: null } } : {}),
    ...dates("createdAt"),
    ...(hasFilter.length ? { $and: hasFilter } : {}),
    ...textFilter,
  };

  /* --------------------------- the others --------------------------- */
  const topicFilter = { communityId, ...authorFilter("authorId"), ...dates("createdAt"), ...(q.has.includes("image") || q.has.includes("video") ? { "media.0": { $exists: true } } : {}), ...(q.has.includes("link") ? { body: { $regex: /https?:\/\//i } } : {}), ...textFilter };
  const postFilter = { communityId, hiddenAt: null, ...authorFilter("authorId"), ...dates("createdAt"), ...(q.has.includes("video") ? { "media.kind": "video" } : q.has.includes("image") ? { "media.kind": "image" } : {}), ...textFilter };
  const eventFilter = { communityId, review: null, ...authorFilter("hostId"), ...dates("startsAt"), ...textFilter };
  // closed kliques (the meetup time has passed; an event's kliques meet before it starts) aren't found any more
  const kliqueDates = dates("meetupAt") as { meetupAt?: Record<string, Date> };
  // and an event's kliques close when the event starts, even when they meet up later
  const startedEvents = await Event.find({ communityId, startsAt: { $lte: new Date(), $gte: new Date(Date.now() - 14 * 24 * 3600_000) } }).distinct("_id");
  const kliqueFilter = { communityId, ...authorFilter("hostId"), meetupAt: { ...(kliqueDates.meetupAt ?? {}), $gt: new Date() }, ...(startedEvents.length ? { eventId: { $nin: startedEvents } } : {}), ...textFilter };

  const counts: Record<SearchKind, number> = { message: 0, topic: 0, post: 0, event: 0, klique: 0, member: 0 };
  const take = (k: SearchKind) => (only === k ? { skip: (page - 1) * PAGE, limit: PAGE + 1 } : { skip: 0, limit: PREVIEW });
  const run = async <T>(k: SearchKind, model: { countDocuments: (f: object) => Promise<number>; find: (f: object, p?: object) => { sort: (s: object) => { skip: (n: number) => { limit: (n: number) => { lean: <R>() => Promise<R> } } } } }, filter: object, dateField: string): Promise<T[]> => {
    if (!want(k)) return [];
    const { skip, limit } = take(k);
    const [n, rows] = await Promise.all([model.countDocuments(filter), model.find(filter, projection).sort(sortBy(dateField)).skip(skip).limit(limit).lean<T[]>()]);
    counts[k] = n;
    return rows;
  };
  const otherKindsOk = !messageOnly;
  const [messages, topics, posts, events, kliques] = await Promise.all([
    run<IChannelMessage>("message", ChannelMessage as never, messageFilter, "createdAt"),
    otherKindsOk ? run<ITopic>("topic", Topic as never, topicFilter, "createdAt") : [],
    otherKindsOk && (space.community.feedPolicy ?? "off") !== "off" ? run<IFeedPost>("post", FeedPost as never, postFilter, "createdAt") : [],
    otherKindsOk ? run<IEvent>("event", Event as never, eventFilter, "startsAt") : [],
    otherKindsOk ? run<ICrew>("klique", Crew as never, kliqueFilter, "meetupAt") : [],
  ]);

  // members: by name or handle (only with free text, and no message-only filters)
  let members: { _id: Types.ObjectId }[] = [];
  if (want("member") && q.text && !messageOnly && !q.from.length) {
    const rx = new RegExp(escapeRegex(q.text.replace(/^@/, "")), "i");
    const ids = await Membership.find({ communityId, subcommunityId: null, status: "active" }).distinct("userId");
    const filter = { _id: { $in: ids, $nin: hidden }, $or: [{ displayName: rx }, { handle: rx }] };
    const { skip, limit } = take("member");
    [counts.member, members] = await Promise.all([User.countDocuments(filter), User.find(filter).select("_id").sort({ displayName: 1 }).skip(skip).limit(limit).lean<{ _id: Types.ObjectId }[]>()]);
  }

  const briefs = await loadBriefs([...messages.map((m) => m.authorId), ...topics.map((t) => t.authorId), ...posts.map((p) => p.authorId), ...events.map((e) => e.hostId), ...kliques.map((k) => k.hostId), ...members.map((m) => m._id)]);
  const base = `/communities/${space.community.slug}`;
  const threadOf = new Map(threads.map((t) => [sid(t._id), t]));
  const hits: SearchHitDTO[] = [
    ...messages.map((m): SearchHitDTO => {
      const chatThread = parentOf.get(sid(m.channelId));
      const ch = nameOf.get(sid(chatThread?.parentChannelId ?? m.channelId));
      const thread = threadOf.get(sid(m.channelId));
      if (chatThread) {
        return { kind: "message", id: sid(m._id), title: `Thread “${chatThread.name}” in #${ch?.name ?? "channel"}`, snippet: snippetOf(m.body || (m.images?.length ? "Photo" : m.sticker || m.stickerUrl ? "Sticker" : ""), words), author: briefs.get(sid(m.authorId)) ?? null, at: m.createdAt.toISOString(), href: `${base}?c=${ch?.slug ?? "general"}&th=${chatThread.slug}`, pinned: !!m.pinnedAt };
      }
      return {
        kind: "message",
        id: sid(m._id),
        title: thread ? `Reply on “${thread.name}”` : `#${ch?.name ?? "channel"}`,
        snippet: snippetOf(m.body || (m.images?.length ? "Photo" : m.sticker || m.stickerUrl ? "Sticker" : ""), words),
        author: briefs.get(sid(m.authorId)) ?? null,
        at: m.createdAt.toISOString(),
        href: thread ? `${base}?view=topics&t=${sid(thread.topicId!)}` : `${base}?${ch?.sub ? `g=${ch.sub}&` : ""}c=${ch?.slug ?? "general"}&m=${sid(m._id)}`,
        pinned: !!m.pinnedAt,
      };
    }),
    ...topics.map((t): SearchHitDTO => ({ kind: "topic", id: sid(t._id), title: t.title, snippet: snippetOf(t.body, words), author: briefs.get(sid(t.authorId)) ?? null, at: t.createdAt.toISOString(), href: `${base}?view=topics&t=${sid(t._id)}` })),
    ...posts.map((p): SearchHitDTO => ({ kind: "post", id: sid(p._id), title: p.title || "Post", snippet: snippetOf(p.caption, words), author: briefs.get(sid(p.authorId)) ?? null, at: p.createdAt.toISOString(), href: `/p/${sid(p._id)}`, image: p.media[0] ? (p.media[0].kind === "video" ? (p.media[0].poster ?? null) : p.media[0].url) : null })),
    ...events.map((e): SearchHitDTO => ({ kind: "event", id: sid(e._id), title: e.title, snippet: snippetOf(e.description, words), author: briefs.get(sid(e.hostId)) ?? null, at: e.startsAt.toISOString(), href: `/events/${sid(e._id)}`, image: e.coverImage ?? null })),
    ...kliques.map((k): SearchHitDTO => ({ kind: "klique", id: sid(k._id), title: k.title, snippet: snippetOf(`${k.area}. ${k.note}`, words), author: briefs.get(sid(k.hostId)) ?? null, at: k.meetupAt.toISOString(), href: `/kliques/${sid(k._id)}`, image: k.coverImage ?? null })),
    ...members.map((m): SearchHitDTO => {
      const b = briefs.get(sid(m._id));
      return { kind: "member", id: sid(m._id), title: b?.displayName ?? "Someone", snippet: `@${b?.handle ?? ""}`, author: b ?? null, at: "", href: `/?profile=${b?.handle ?? ""}` };
    }),
  ];
  const pageHits = only ? hits.slice(0, PAGE) : hits;
  return { query: q.text, filters: describe(q), counts, hits: pageHits, hasMore: only ? (hits.length > PAGE) : false, page, type: only ?? null, sort };
}

function empty(q: ParsedQuery): CommunitySearchDTO {
  return { query: q.text, filters: describe(q), counts: { message: 0, topic: 0, post: 0, event: 0, klique: 0, member: 0 }, hits: [], hasMore: false, page: 1, type: q.type, sort: "newest" };
}

/** The filters understood, as chips ("from:@tobi", "has:image"…). */
function describe(q: ParsedQuery): string[] {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return [
    ...q.from.map((h) => `from:@${h}`),
    ...q.in.map((c) => `in:#${c}`),
    ...q.mentions.map((h) => `mentions:@${h}`),
    ...q.has.map((h) => `has:${h}`),
    ...(q.after ? [`after:${d(q.after)}`] : []),
    ...(q.before ? [`before:${d(q.before)}`] : []),
    ...(q.pinned ? ["pinned:true"] : []),
    ...(q.type ? [`type:${q.type}`] : []),
  ];
}

/* ------------------------------ direct messages ------------------------------ */

/**
 * Search your own direct messages (all of them, or one chat): free text plus from:@user, has:image|video|link|sticker,
 * before:/after:/during:. Only chats you're in; nothing from people you've blocked. Newest first.
 */
export async function searchDirectMessages(viewer: IUser, raw: string, conversationId?: string): Promise<{ query: string; filters: string[]; hits: SearchHitDTO[] }> {
  const q = parseQuery(raw);
  const { Conversation } = await import("../models/Conversation");
  const { Message } = await import("../models/Message");
  const convFilter: Record<string, unknown> = { participants: viewer._id };
  if (conversationId) convFilter._id = conversationId;
  const convs = await Conversation.find(convFilter).select("_id participants group").lean<{ _id: Types.ObjectId; participants: Types.ObjectId[]; group?: { name: string } | null }[]>();
  if (!convs.length) return { query: q.text, filters: describe(q), hits: [] };
  const fromUsers = q.from.length ? await User.find({ handle: { $in: q.from } }).select("_id").lean<{ _id: Types.ObjectId }[]>() : [];
  if (q.from.length && !fromUsers.length) return { query: q.text, filters: describe(q), hits: [] };
  const hidden = await hiddenUserIds(viewer._id);
  const has: Record<string, unknown>[] = [];
  for (const h of q.has) {
    if (h === "image") has.push({ images: { $regex: /\.(jpe?g|png|webp|gif|avif|heic)(\?|#|$)/i } });
    if (h === "video") has.push({ images: { $regex: /\.(mp4|webm|mov|m4v)(\?|#|$)/i } });
    if (h === "link") has.push({ body: { $regex: /https?:\/\//i } });
    if (h === "sticker") has.push({ $or: [{ sticker: { $ne: null } }, { stickerUrl: { $ne: null } }] });
  }
  // every word, anywhere in the message, any case
  const words = q.text.split(/\s+/).filter((w) => w.length > 1);
  const filter: Record<string, unknown> = {
    conversationId: { $in: convs.map((c) => c._id) },
    deletedAt: null,
    ...(fromUsers.length ? { senderId: { $in: fromUsers.map((u) => u._id) } } : hidden.length ? { senderId: { $nin: hidden } } : {}),
    ...(q.before || q.after ? { createdAt: { ...(q.after ? { $gte: q.after } : {}), ...(q.before ? { $lt: q.before } : {}) } } : {}),
    ...(has.length || words.length ? { $and: [...has, ...words.map((w) => ({ body: { $regex: new RegExp(escapeRegex(w), "i") } }))] } : {}),
  };
  if (!words.length && !has.length && !q.from.length && !q.before && !q.after) return { query: q.text, filters: describe(q), hits: [] };
  const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(50).lean<{ _id: Types.ObjectId; conversationId: Types.ObjectId; senderId: Types.ObjectId; body: string; images?: string[]; sticker?: string | null; stickerUrl?: string | null; createdAt: Date }[]>();
  const other = new Map(convs.map((c) => [sid(c._id), c.participants.find((p) => sid(p) !== sid(viewer._id)) ?? c.participants[0]]));
  const groupNames = new Map(convs.flatMap((c) => (c.group ? [[sid(c._id), c.group.name] as const] : [])));
  const briefs = await loadBriefs([...rows.map((r) => r.senderId), ...other.values()]);
  return {
    query: q.text,
    filters: describe(q),
    hits: rows.map((m) => ({
      kind: "message" as const,
      id: sid(m._id),
      // a group goes by its own name, not one of the people in it
      title: groupNames.get(sid(m.conversationId)) ?? briefs.get(sid(other.get(sid(m.conversationId))!))?.displayName ?? "Chat",
      snippet: snippetOf(m.body || (m.images?.length ? "Photo" : m.sticker || m.stickerUrl ? "Sticker" : ""), words),
      author: briefs.get(sid(m.senderId)) ?? null,
      at: m.createdAt.toISOString(),
      href: `/messages/${sid(m.conversationId)}?m=${sid(m._id)}`,
    })),
  };
}
