import "server-only";
import { Types } from "mongoose";
import type { AdDTO, AdInput, AdminAdDTO, AdSlot } from "@/lib/types";
import { isInterestId } from "@/lib/constants";
import { parseScope, scopesOverlap, WORLD } from "@/lib/places";
import { badRequest, notFound } from "../http/errors";
import { Ad, AD_SLOTS, type IAd } from "../models/Ad";
import { Event, type IEvent } from "../models/Event";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { Report } from "../models/Safety";
import type { IUser } from "../models/User";
import { canSeeEventInFeeds } from "../policies/access";
import { kliqueId } from "./klique-id";
import { Promotion, type IPromotion } from "../models/Promotion";
import { loadBriefs, toEvents } from "../serializers";
import { startReviewedRun } from "./promotions.service";
import { sid } from "./helpers";
import { deleteUploads } from "./media.service";

/* ----------------------------- serving ----------------------------- */

const isLive = (a: Pick<IAd, "status" | "startsAt" | "endsAt">, now = new Date()) => a.status === "active" && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now);

function matches(a: IAd, ctx: { where: string | undefined; interest?: string; q?: string; viewer: IUser | null }) {
  if (a.places.length) {
    const here = parseScope(ctx.where) ?? WORLD;
    if (!a.places.some((p) => { const s = parseScope(p); return !!s && scopesOverlap(s, here); })) return false;
  }
  if (a.interests.length) {
    const wanted = ctx.interest ? [ctx.interest] : (ctx.viewer?.interests ?? []);
    // with no scene in play (signed out, no filter) a scene-targeted ad can still show
    if (wanted.length && !wanted.some((i) => a.interests.includes(i as IAd["interests"][number]))) return false;
  }
  if (ctx.q !== undefined && a.keywords.length) {
    const q = ctx.q.toLowerCase();
    if (!a.keywords.some((k) => q.includes(k.toLowerCase()))) return false;
  }
  return true;
}

/** Weighted pick without repeats: heavier ads win more often, everyone eligible gets a turn. */
function pickWeighted<T extends { weight: number }>(rows: T[], n: number): T[] {
  const pool = [...rows];
  const out: T[] = [];
  while (pool.length && out.length < n) {
    const total = pool.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * total;
    const i = pool.findIndex((r) => (roll -= r.weight) < 0);
    out.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

export async function serveAds(
  viewer: IUser | null,
  q: { slot: AdSlot; where?: string; interest?: string; search?: string; exclude?: string; count: number },
): Promise<AdDTO[]> {
  const now = new Date();
  const rows = await Ad.find({ status: "active", slots: q.slot }).lean<IAd[]>();
  let eligible = rows.filter((a) => isLive(a, now) && matches(a, { where: q.where, interest: q.interest, q: q.slot === "search" ? (q.search ?? "") : undefined, viewer }));

  // Promoted events must still be on, in this viewer's feeds (Klique's, or a community they're in), and not the
  // page they're already on.
  const eventIds = eligible.filter((a) => a.kind === "event" && a.eventId).map((a) => a.eventId!);
  const events = eventIds.length ? await Event.find({ _id: { $in: eventIds }, cancelled: false, review: null, startsAt: { $gt: now } }).lean<IEvent[]>() : [];
  const visible = new Map<string, IEvent>();
  for (const e of events) if (await canSeeEventInFeeds(e, viewer)) visible.set(sid(e._id), e);
  // Sponsored communities: still public, and not one this viewer is already in.
  const commIds = eligible.filter((a) => a.kind === "community" && a.communityId).map((a) => a.communityId!);
  const comms = commIds.length ? await Community.find({ _id: { $in: commIds }, privacy: "public" }).lean<ICommunity[]>() : [];
  const joined = viewer && comms.length ? new Set((await Membership.find({ userId: viewer._id, communityId: { $in: comms.map((c) => c._id) }, subcommunityId: null, status: "active" }).select("communityId").lean<{ communityId: Types.ObjectId }[]>()).map((m) => sid(m.communityId))) : new Set<string>();
  const commById = new Map(comms.filter((c) => !joined.has(sid(c._id))).map((c) => [sid(c._id), c]));
  eligible = eligible.filter((a) =>
    (q.slot === "communities") !== (a.kind === "community") ? false : a.kind === "brand" ? true : a.kind === "community" ? !!a.communityId && commById.has(sid(a.communityId)) : !!a.eventId && visible.has(sid(a.eventId)) && sid(a.eventId) !== q.exclude,
  );

  // one ad per community: two ads for the same community never sit side by side
  const seenCommunity = new Set<string>();
  eligible = eligible.filter((a) => a.kind !== "community" || (!seenCommunity.has(sid(a.communityId!)) && !!seenCommunity.add(sid(a.communityId!))));
  const chosen = pickWeighted(eligible, q.count);
  if (!chosen.length) return [];
  const dtos = new Map((await toEvents(chosen.filter((a) => a.kind === "event").map((a) => visible.get(sid(a.eventId!))!), viewer)).map((e) => [e.id, e]));
  // Not counted as a view here: a page can ask more than once (e.g. before it knows your city), and some slots are
  // hidden on phones. The browser reports a view once the ad is actually on screen (recordView).

  return chosen.map((a) => {
    const ev = a.kind === "event" ? (dtos.get(sid(a.eventId!)) ?? null) : null;
    const c = a.kind === "community" ? commById.get(sid(a.communityId!)) : undefined;
    if (c) {
      return {
        id: sid(a._id),
        kind: a.kind,
        advertiser: a.advertiser || c.name,
        title: a.title || c.name,
        body: a.body || c.description.slice(0, 140),
        imageUrl: a.imageUrl ?? c.coverImage ?? null,
        ctaLabel: a.ctaLabel || "View",
        url: null,
        event: null,
        community: { id: sid(c._id), slug: c.slug, name: c.name, interest: c.interest, coverImage: c.coverImage, memberCount: c.memberCount },
      };
    }
    return {
      id: sid(a._id),
      kind: a.kind,
      advertiser: a.advertiser || ev?.organizer?.name || ev?.community?.name || ev?.host.displayName || "",
      title: a.title || ev?.title || "",
      body: a.body,
      imageUrl: a.imageUrl ?? ev?.coverImage ?? null,
      ctaLabel: a.ctaLabel || (a.kind === "event" ? "See event" : "Learn more"),
      url: a.kind === "brand" ? a.url : null,
      event: ev,
    };
  });
}

/** The ad was on screen (the browser reports it once per showing). What advertisers see as "views". */
export async function recordView(id: string) {
  if (Types.ObjectId.isValid(id)) await Ad.updateOne({ _id: id, status: "active" }, { $inc: { impressions: 1 } });
  return { ok: true };
}

export async function recordClick(id: string) {
  await Ad.updateOne({ _id: id }, { $inc: { clicks: 1 } });
  return { ok: true };
}

/* ------------------------------ admin ------------------------------ */

const httpsUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

async function clean(input: AdInput): Promise<Partial<IAd>> {
  const slots = [...new Set(input.slots)].filter((s): s is AdSlot => (AD_SLOTS as readonly string[]).includes(s));
  if (!slots.length) throw badRequest("Pick at least one spot on the site for this ad.");
  const places = [...new Set(input.places)].filter((p) => parseScope(p));
  const interests = [...new Set(input.interests)].filter(isInterestId);
  const keywords = [...new Set(input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest("The end date must be after the start date.");

  const base: Partial<IAd> = {
    name: input.name.trim().slice(0, 120),
    kind: input.kind,
    advertiser: (input.advertiser ?? "").trim().slice(0, 80),
    title: (input.title ?? "").trim().slice(0, 120),
    body: (input.body ?? "").trim().slice(0, 200),
    imageUrl: input.imageUrl ? httpsUrl(input.imageUrl) : null,
    ctaLabel: (input.ctaLabel ?? "").trim().slice(0, 24),
    slots,
    places,
    interests,
    keywords,
    startsAt,
    endsAt,
    weight: Math.min(10, Math.max(1, Math.round(input.weight || 5))),
  };
  if (!base.name) throw badRequest("Give the ad a name so you can find it later.");

  if (input.kind === "community") {
    const c = input.communityId ? await Community.findById(input.communityId).select("_id privacy").lean<Pick<ICommunity, "_id" | "privacy">>() : null;
    if (!c) throw badRequest("Pick the community to sponsor.");
    if (c.privacy !== "public") throw badRequest("Only public communities can be sponsored.");
    // it only fits the "Sponsored communities" list, and that list only takes these
    return { ...base, slots: ["communities"], eventId: null, communityId: c._id, url: "" };
  }
  if (slots.includes("communities")) throw badRequest("“Sponsored communities” is only for sponsored-community ads.");
  if (input.kind === "event") {
    const e = input.eventId ? await Event.findById(input.eventId).lean<IEvent>() : null;
    if (!e) throw badRequest("Pick the event to promote.");
    if (e.subcommunityId || !e.communityId || String(e.communityId) !== String(await kliqueId())) throw badRequest("Only Klique's own events can be promoted: a community's events are for its members.");
    return { ...base, eventId: e._id, communityId: null, url: "" };
  }
  const url = httpsUrl((input.url ?? "").trim());
  if (!url) throw badRequest("Add the link the ad's button opens, starting with https://");
  if (!base.title) throw badRequest("Add a headline.");
  if (!base.advertiser) throw badRequest("Add who the ad is from (it's shown next to “Sponsored”).");
  return { ...base, eventId: null, communityId: null, url };
}

async function toAdmin(rows: IAd[]): Promise<AdminAdDTO[]> {
  const evIds = rows.map((a) => a.eventId).filter((x): x is Types.ObjectId => !!x);
  const promoIds = rows.map((a) => a.promotionId).filter((x): x is Types.ObjectId => !!x);
  const promos = promoIds.length ? await Promotion.find({ _id: { $in: promoIds } }).lean<IPromotion[]>() : [];
  const payers = await loadBriefs(promos.map((p) => p.hostId));
  const promoById = new Map(promos.map((p) => [sid(p._id), p]));
  const commIds = rows.map((a) => a.communityId).filter((x): x is Types.ObjectId => !!x);
  const comms = commIds.length ? await Community.find({ _id: { $in: commIds } }).select("slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">[]>() : [];
  const commById = new Map(comms.map((c) => [sid(c._id), c]));
  const [events, reports] = await Promise.all([
    evIds.length ? Event.find({ _id: { $in: evIds } }).select("title startsAt cancelled").lean<Pick<IEvent, "_id" | "title" | "startsAt" | "cancelled">[]>() : [],
    Report.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { targetType: "ad", targetId: { $in: rows.map((a) => a._id) } } }, { $group: { _id: "$targetId", n: { $sum: 1 } } }]),
  ]);
  const evById = new Map(events.map((e) => [sid(e._id), e]));
  const repById = new Map(reports.map((r) => [sid(r._id), r.n]));
  const now = new Date();
  return rows.map((a) => {
    const e = a.eventId ? evById.get(sid(a.eventId)) : undefined;
    const c = a.communityId ? commById.get(sid(a.communityId)) : undefined;
    return {
      id: sid(a._id),
      name: a.name,
      kind: a.kind,
      status: a.status,
      live: isLive(a, now),
      eventId: a.eventId ? sid(a.eventId) : null,
      event: e ? { id: sid(e._id), title: e.title, startsAt: e.startsAt.toISOString(), cancelled: e.cancelled } : null,
      communityId: a.communityId ? sid(a.communityId) : null,
      community: c ? { id: sid(c._id), slug: c.slug, name: c.name } : null,
      advertiser: a.advertiser,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl ?? null,
      ctaLabel: a.ctaLabel,
      url: a.url,
      slots: a.slots,
      places: a.places,
      interests: a.interests,
      keywords: a.keywords,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      weight: a.weight,
      impressions: a.impressions,
      clicks: a.clicks,
      reports: repById.get(sid(a._id)) ?? 0,
      paid: (() => {
        const p = a.promotionId ? promoById.get(sid(a.promotionId)) : undefined;
        return p ? { by: payers.get(sid(p.hostId)) ?? null, amount: p.amount / 100, currency: p.currency, days: p.days } : null;
      })(),
      pendingReview: !!a.pendingReview,
      createdAt: a.createdAt.toISOString(),
    } as AdminAdDTO;
  });
}

export async function listAds(): Promise<AdminAdDTO[]> {
  return toAdmin(await Ad.find().sort({ createdAt: -1 }).limit(200).lean<IAd[]>());
}

export async function createAd(admin: IUser, input: AdInput): Promise<AdminAdDTO> {
  const doc = await Ad.create({ ...(await clean(input)), status: input.status ?? "active", createdBy: admin._id });
  return (await toAdmin([doc.toObject() as IAd]))[0];
}

export async function updateAd(id: string, input: AdInput): Promise<AdminAdDTO> {
  const set = await clean(input);
  if (input.status) set.status = input.status;
  const before = await Ad.findById(id).select("imageUrl").lean<Pick<IAd, "imageUrl">>();
  const doc = await Ad.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean<IAd>();
  if (!doc) throw notFound("That ad is gone.");
  if (before?.imageUrl && before.imageUrl !== doc.imageUrl) deleteUploads([before.imageUrl]);
  return (await toAdmin([doc]))[0];
}

export async function setAdStatus(id: string, status: "active" | "paused"): Promise<AdminAdDTO> {
  const before = await Ad.findById(id).lean<IAd>();
  if (!before) throw notFound("That ad is gone.");
  await Ad.updateOne({ _id: before._id }, { status });
  // resuming a paid promotion that was waiting for review approves it and starts its run now
  if (status === "active") await startReviewedRun(before);
  return (await toAdmin([(await Ad.findById(id).lean<IAd>())!]))[0];
}

export async function deleteAd(id: string): Promise<{ deleted: boolean; name: string }> {
  const doc = await Ad.findByIdAndDelete(id).lean<IAd>();
  if (!doc) throw notFound("That ad is gone.");
  deleteUploads([doc.imageUrl]);
  return { deleted: true, name: doc.name };
}
