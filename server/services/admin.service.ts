import "server-only";
import type { Types } from "mongoose";
import type {
  AdminCommunityRow,
  AdminEventFilter,
  AdminEventRow,
  AdminOverviewDTO,
  AdminSummaryDTO,
  AdminUserDTO,
  AdminUserDetailDTO,
  AdminUserFilter,
  AuditEntryDTO,
  Paginated,
  ReportAction,
  ReportDTO,
  ReportStatus,
  ReportTargetDTO,
  SystemStatusDTO,
  UserBrief,
} from "@/lib/types";
import { ablyKey, adminEmails, appUrl, cronSecret, googleConfig, isProd, livekitConfig, paystackConfig, promotionPricePerDay, promotionReview, r2Config, smtpConfig, webPushConfig } from "../env";
import { badRequest, forbidden, notFound } from "../http/errors";
import { Channel, ChannelMessage, type IChannel, type IChannelMessage } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Ad, type IAd } from "../models/Ad";
import { AdminAction, type IAdminAction } from "../models/AdminAction";
import { EventDraft } from "../models/EventDraft";
import { Membership } from "../models/Membership";
import { Message, type IMessage } from "../models/Message";
import { Post, type IPost } from "../models/Post";
import { Report, type IReport } from "../models/Safety";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { loadBriefs, toBrief } from "../serializers";
import { escapeRegex, sid } from "./helpers";
import { purgeCommunity } from "./communities.service";
import { purgeEvent } from "./events.service";
import { deleteUploads } from "./media.service";

/** Everything here is for site admins only (ADMIN_EMAILS). */
export function assertAdmin(viewer: IUser) {
  if (!isSiteAdmin(viewer)) throw forbidden("Admins only.");
}

/* ------------------------------ reports ----------------------------- */

async function describeTarget(r: IReport, briefs: Map<string, UserBrief>): Promise<ReportTargetDTO> {
  const none: ReportTargetDTO = { title: "This was deleted", body: "", images: [], author: null, href: null, gone: true, removable: false };
  const by = (id: Types.ObjectId | null | undefined) => (id ? (briefs.get(sid(id)) ?? null) : null);
  switch (r.targetType) {
    case "user": {
      const u = await User.findById(r.targetId).lean<IUser>();
      if (!u) return none;
      return { title: `${u.displayName} (@${u.handle})${u.suspendedAt ? " · suspended" : ""}`, body: u.bio, images: [u.avatarUrl, u.bannerUrl].filter((x): x is string => !!x), author: toBrief(u), href: `/people/${u.handle}`, gone: false, removable: false };
    }
    case "post": {
      const p = await Post.findById(r.targetId).lean<IPost>();
      if (!p) return none;
      const c = await Community.findById(p.communityId).select("slug name").lean<Pick<ICommunity, "slug" | "name">>();
      const author = (await loadBriefs([p.authorId])).get(sid(p.authorId)) ?? null;
      return { title: `Group update in ${c?.name ?? "a community"}`, body: p.body, images: p.imageUrl ? [p.imageUrl] : [], author, href: c ? `/communities/${c.slug}` : null, gone: false, removable: true };
    }
    case "event": {
      const e = await Event.findById(r.targetId).lean<IEvent>();
      if (!e) return none;
      const author = (await loadBriefs([e.hostId])).get(sid(e.hostId)) ?? null;
      return { title: `Event: ${e.title}`, body: e.description, images: e.coverImage ? [e.coverImage] : [], author, href: `/events/${sid(e._id)}`, gone: false, removable: true };
    }
    case "community": {
      const c = await Community.findById(r.targetId).lean<ICommunity>();
      if (!c) return none;
      const author = (await loadBriefs([c.ownerId])).get(sid(c.ownerId)) ?? null;
      return { title: `Community: ${c.name}`, body: c.description, images: c.coverImage ? [c.coverImage] : [], author, href: `/communities/${c.slug}`, gone: false, removable: false };
    }
    case "subcommunity": {
      const s = await Subcommunity.findById(r.targetId).lean<ISubcommunity>();
      if (!s) return none;
      const c = await Community.findById(s.communityId).select("slug name ownerId").lean<Pick<ICommunity, "slug" | "name" | "ownerId">>();
      return { title: `Group: ${s.name}${c ? ` in ${c.name}` : ""}`, body: s.description, images: [], author: c ? by(c.ownerId) ?? (await loadBriefs([c.ownerId])).get(sid(c.ownerId)) ?? null : null, href: c ? `/communities/${c.slug}?g=${s.slug}` : null, gone: false, removable: false };
    }
    case "channelMessage": {
      const m = await ChannelMessage.findById(r.targetId).lean<IChannelMessage>();
      if (!m) return none;
      const [ch, c] = await Promise.all([Channel.findById(m.channelId).select("slug name").lean<Pick<IChannel, "slug" | "name">>(), Community.findById(m.communityId).select("slug name").lean<Pick<ICommunity, "slug" | "name">>()]);
      const author = (await loadBriefs([m.authorId])).get(sid(m.authorId)) ?? null;
      return { title: `Message in ${c?.name ?? "a community"} #${ch?.name ?? "channel"}`, body: m.deletedAt ? "" : m.body, images: m.deletedAt ? [] : (m.images ?? []), author, href: c && ch ? `/communities/${c.slug}?c=${ch.slug}` : null, gone: !!m.deletedAt, removable: !m.deletedAt };
    }
    case "ad": {
      const a = await Ad.findById(r.targetId).lean<IAd>();
      if (!a) return none;
      return { title: `Ad: ${a.name}${a.status === "paused" ? " · paused" : ""}`, body: [a.advertiser, a.title, a.body].filter(Boolean).join(" · "), images: a.imageUrl ? [a.imageUrl] : [], author: null, href: "/admin/ads", gone: false, removable: a.status === "active" };
    }
    case "message": {
      const m = await Message.findById(r.targetId).lean<IMessage>();
      if (!m) return none;
      const author = (await loadBriefs([m.senderId])).get(sid(m.senderId)) ?? null;
      // A direct message: only the reported message itself is shown, never the rest of the conversation.
      return { title: "Direct message", body: m.deletedAt ? "" : m.body, images: m.deletedAt ? [] : (m.images ?? []), author, href: null, gone: !!m.deletedAt, removable: !m.deletedAt };
    }
  }
}

export async function listReports(status: ReportStatus, page: number): Promise<{ items: ReportDTO[]; page: number; hasMore: boolean }> {
  const size = 20;
  const rows = await Report.find({ status })
    .sort({ createdAt: status === "open" ? 1 : -1 })
    .skip((page - 1) * size)
    .limit(size + 1)
    .lean<IReport[]>();
  const hasMore = rows.length > size;
  const list = rows.slice(0, size);
  const briefs = await loadBriefs(list.map((r) => r.reporterId));
  const counts = await Report.aggregate<{ _id: { t: string; id: Types.ObjectId }; n: number }>([
    { $match: { status: "open", targetId: { $in: list.map((r) => r.targetId) } } },
    { $group: { _id: { t: "$targetType", id: "$targetId" }, n: { $sum: 1 } } },
  ]);
  const countOf = new Map(counts.map((c) => [`${c._id.t}:${sid(c._id.id)}`, c.n]));
  const items = await Promise.all(
    list.map(async (r): Promise<ReportDTO> => ({
      id: sid(r._id),
      status: r.status,
      targetType: r.targetType,
      targetId: sid(r.targetId),
      reason: r.reason,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      reporter: briefs.get(sid(r.reporterId)) ?? null,
      openCount: countOf.get(`${r.targetType}:${sid(r.targetId)}`) ?? (r.status === "open" ? 1 : 0),
      target: await describeTarget(r, briefs),
    })),
  );
  return { items, page, hasMore };
}

export async function reportCounts(): Promise<Record<ReportStatus, number>> {
  const rows = await Report.aggregate<{ _id: ReportStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  const out: Record<ReportStatus, number> = { open: 0, reviewing: 0, actioned: 0, dismissed: 0 };
  for (const r of rows) out[r._id] = r.n;
  return out;
}

/** Close every open report about the same thing, so the queue doesn't show it again. */
async function closeAll(r: IReport, status: "actioned" | "dismissed") {
  await Report.updateMany({ targetType: r.targetType, targetId: r.targetId, status: { $in: ["open", "reviewing"] } }, { status });
}

async function removeTarget(r: IReport, admin: IUser) {
  switch (r.targetType) {
    case "post": {
      const p = await Post.findById(r.targetId).lean<IPost>();
      if (!p) return;
      await Post.deleteOne({ _id: p._id });
      deleteUploads([p.imageUrl]);
      return;
    }
    case "event": {
      const e = await Event.findById(r.targetId).lean<IEvent>();
      if (e) await purgeEvent(e);
      return;
    }
    case "channelMessage": {
      const m = await ChannelMessage.findById(r.targetId).lean<IChannelMessage>();
      if (!m || m.deletedAt) return;
      await ChannelMessage.updateOne({ _id: m._id }, { body: "", mentions: [], images: [], pinnedAt: null, pinnedById: null, deletedAt: new Date(), deletedById: admin._id });
      deleteUploads(m.images ?? []);
      return;
    }
    case "message": {
      const m = await Message.findById(r.targetId).lean<IMessage>();
      if (!m || m.deletedAt) return;
      await Message.updateOne({ _id: m._id }, { $set: { body: "", sticker: null, images: [], deletedAt: new Date() } });
      deleteUploads(m.images ?? []);
      return;
    }
    case "ad":
      // reported ads are paused, not deleted, so the advertiser's record and numbers survive
      await Ad.updateOne({ _id: r.targetId }, { status: "paused" });
      return;
    default:
      throw badRequest("That can't be removed from here. Suspend the person responsible instead, or open it and deal with it there.");
  }
}

async function authorOf(r: IReport): Promise<Types.ObjectId | null> {
  switch (r.targetType) {
    case "user":
      return r.targetId;
    case "post":
      return (await Post.findById(r.targetId).select("authorId").lean<Pick<IPost, "authorId">>())?.authorId ?? null;
    case "event":
      return (await Event.findById(r.targetId).select("hostId").lean<Pick<IEvent, "hostId">>())?.hostId ?? null;
    case "community":
      return (await Community.findById(r.targetId).select("ownerId").lean<Pick<ICommunity, "ownerId">>())?.ownerId ?? null;
    case "subcommunity": {
      const s = await Subcommunity.findById(r.targetId).select("communityId").lean<Pick<ISubcommunity, "communityId">>();
      return s ? ((await Community.findById(s.communityId).select("ownerId").lean<Pick<ICommunity, "ownerId">>())?.ownerId ?? null) : null;
    }
    case "channelMessage":
      return (await ChannelMessage.findById(r.targetId).select("authorId").lean<Pick<IChannelMessage, "authorId">>())?.authorId ?? null;
    case "message":
      return (await Message.findById(r.targetId).select("senderId").lean<Pick<IMessage, "senderId">>())?.senderId ?? null;
    case "ad":
      return null;
  }
}

export async function actOnReport(admin: IUser, id: string, action: ReportAction, note = "") {
  const r = await Report.findById(id).lean<IReport>();
  if (!r) throw notFound("That report is gone.");
  const target = await describeTarget(r, new Map());
  const label = target.title.slice(0, 200);
  if (action === "reviewing") {
    await Report.updateOne({ _id: r._id }, { status: "reviewing" });
    return { status: "reviewing" as const };
  }
  if (action === "dismiss") {
    await closeAll(r, "dismissed");
    await logAction(admin, "report.dismiss", r.targetType, r.targetId, label, note || r.reason, target.gone ? null : target.href);
    return { status: "dismissed" as const };
  }
  if (action === "remove" || action === "remove-and-suspend") {
    await removeTarget(r, admin);
    await logAction(admin, "content.delete", r.targetType, r.targetId, label, note || `Reported for ${r.reason}`, null);
  }
  if (action === "suspend" || action === "remove-and-suspend") {
    const who = await authorOf(r);
    if (!who) throw notFound("We couldn't find who's responsible.");
    await setSuspended(admin, sid(who), true, note || `Reported for ${r.reason}`);
  }
  await closeAll(r, "actioned");
  return { status: "actioned" as const };
}

/* ----------------------------- audit log ---------------------------- */

export async function logAction(
  admin: IUser,
  action: string,
  targetType: IAdminAction["targetType"],
  targetId: Types.ObjectId | string | null,
  targetLabel: string,
  note = "",
  href: string | null = null,
) {
  await AdminAction.create({ adminId: admin._id, action, targetType, targetId, targetLabel: targetLabel.slice(0, 200), note: note.slice(0, 300), href });
}

async function toAudit(rows: IAdminAction[]): Promise<AuditEntryDTO[]> {
  const admins = await loadBriefs(rows.map((r) => r.adminId));
  return rows.map((r) => ({
    id: sid(r._id),
    admin: admins.get(sid(r.adminId)) ?? null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId ? sid(r.targetId) : null,
    targetLabel: r.targetLabel,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    href: r.href ?? null,
  }));
}

export async function listAudit(q: { page: number; action?: string; q?: string }): Promise<Paginated<AuditEntryDTO>> {
  const size = 30;
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`);
  if (q.q) filter.targetLabel = new RegExp(escapeRegex(q.q), "i");
  const rows = await AdminAction.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * size).limit(size + 1).lean<IAdminAction[]>();
  return { items: await toAudit(rows.slice(0, size)), page: q.page, hasMore: rows.length > size };
}

/* ------------------------------ people ------------------------------ */

const toAdminUser = (u: IUser): AdminUserDTO => ({
  ...toBrief(u),
  email: u.email,
  emailVerified: !!u.emailVerifiedAt,
  isAdmin: isSiteAdmin(u),
  suspended: !!u.suspendedAt,
  suspendedReason: u.suspendedReason ?? "",
  createdAt: u.createdAt.toISOString(),
});

const DAY = 24 * 60 * 60 * 1000;
/** communities at least this big count as "large" on the overview */
const LARGE_COMMUNITY = 100;

/** Everyone, newest first, narrowed by a filter and a name / handle / email search. */
export async function listUsers(q: { filter: AdminUserFilter; q: string; page: number }): Promise<Paginated<AdminUserDTO>> {
  const size = 25;
  const and: Record<string, unknown>[] = [];
  const text = q.q.trim();
  if (text) {
    const rx = new RegExp(escapeRegex(text.replace(/^@/, "")), "i");
    and.push({ $or: [{ handle: rx }, { displayName: rx }, { email: rx }] });
  }
  if (q.filter === "new") and.push({ createdAt: { $gte: new Date(Date.now() - 7 * DAY) } });
  if (q.filter === "admins") and.push({ email: { $in: [...adminEmails()] } });
  if (q.filter === "suspended") and.push({ suspendedAt: { $ne: null } });
  if (q.filter === "unverified") and.push({ emailVerifiedAt: null });
  const rows = await User.find(and.length ? { $and: and } : {})
    .sort({ createdAt: -1 })
    .skip((q.page - 1) * size)
    .limit(size + 1)
    .lean<IUser[]>();
  return { items: rows.slice(0, size).map(toAdminUser), page: q.page, hasMore: rows.length > size };
}

export async function userDetail(userId: string): Promise<AdminUserDetailDTO> {
  const u = await User.findById(userId).lean<IUser>();
  if (!u) throw notFound("We couldn't find that person.");
  const [communities, communitiesOwned, memberships, events, eventsHosted, reportsAgainst, reportsFiled, history] = await Promise.all([
    Community.find({ ownerId: u._id }).sort({ memberCount: -1 }).limit(5).select("slug name memberCount").lean<Pick<ICommunity, "slug" | "name" | "memberCount">[]>(),
    Community.countDocuments({ ownerId: u._id }),
    Membership.countDocuments({ userId: u._id, status: "active", subcommunityId: null }),
    Event.find({ hostId: u._id }).sort({ startsAt: -1 }).limit(5).select("title startsAt cancelled").lean<Pick<IEvent, "_id" | "title" | "startsAt" | "cancelled">[]>(),
    Event.countDocuments({ hostId: u._id }),
    Report.countDocuments({ targetType: "user", targetId: u._id }),
    Report.countDocuments({ reporterId: u._id }),
    AdminAction.find({ targetType: "user", targetId: u._id }).sort({ createdAt: -1 }).limit(10).lean<IAdminAction[]>(),
  ]);
  return {
    user: toAdminUser(u),
    googleLinked: !!u.googleId,
    hasPassword: u.hasPassword !== false,
    stats: { communitiesOwned, memberships, eventsHosted, reportsAgainst, reportsFiled },
    communities: communities.map((c) => ({ slug: c.slug, name: c.name, memberCount: c.memberCount })),
    events: events.map((e) => ({ id: sid(e._id), title: e.title, startsAt: e.startsAt.toISOString(), cancelled: e.cancelled })),
    history: await toAudit(history),
  };
}

async function findUser(userId: string): Promise<IUser> {
  const u = await User.findById(userId).lean<IUser>();
  if (!u) throw notFound("We couldn't find that person.");
  return u;
}

export async function setSuspended(admin: IUser, userId: string, on: boolean, reason = ""): Promise<AdminUserDTO> {
  if (userId === sid(admin._id)) throw badRequest("You can't suspend yourself.");
  const target = await findUser(userId);
  if (on && isSiteAdmin(target)) throw forbidden("Admins can't be suspended from here. Remove them from ADMIN_EMAILS first.");
  // Suspending also signs them out everywhere (tokenVersion bump invalidates every session).
  const u = await User.findByIdAndUpdate(
    userId,
    on ? { suspendedAt: new Date(), suspendedReason: reason.slice(0, 300), $inc: { tokenVersion: 1 } } : { suspendedAt: null, suspendedReason: "" },
    { new: true },
  ).lean<IUser>();
  await logAction(admin, on ? "user.suspend" : "user.restore", "user", u!._id, `@${u!.handle}`, on ? reason : "", `/people/${u!.handle}`);
  return toAdminUser(u!);
}

/** Sign someone out on every device (e.g. a stolen phone). */
export async function revokeSessions(admin: IUser, userId: string): Promise<AdminUserDTO> {
  await findUser(userId);
  const u = await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true }).lean<IUser>();
  await logAction(admin, "user.signout", "user", u!._id, `@${u!.handle}`, "", `/people/${u!.handle}`);
  return toAdminUser(u!);
}

/* ------------------------------ events ------------------------------ */

export async function listAdminEvents(q: { filter: AdminEventFilter; q: string; page: number }): Promise<Paginated<AdminEventRow>> {
  const size = 25;
  const now = new Date();
  const and: Record<string, unknown>[] = [];
  if (q.q.trim()) and.push({ title: new RegExp(escapeRegex(q.q.trim()), "i") });
  if (q.filter === "upcoming") and.push({ cancelled: false, startsAt: { $gte: now } });
  if (q.filter === "past") and.push({ cancelled: false, startsAt: { $lt: now } });
  if (q.filter === "cancelled") and.push({ cancelled: true });
  if (q.filter === "imported") and.push({ sourceUrl: { $nin: [null, ""] } });
  const rows = await Event.find(and.length ? { $and: and } : {})
    .sort(q.filter === "upcoming" ? { startsAt: 1 } : { startsAt: -1 })
    .skip((q.page - 1) * size)
    .limit(size + 1)
    .lean<IEvent[]>();
  const list = rows.slice(0, size);
  const [hosts, communities] = await Promise.all([
    loadBriefs(list.map((e) => e.hostId)),
    Community.find({ _id: { $in: list.map((e) => e.communityId).filter(Boolean) } }).select("slug name").lean<Pick<ICommunity, "_id" | "slug" | "name">[]>(),
  ]);
  const cById = new Map(communities.map((c) => [sid(c._id), { slug: c.slug, name: c.name }]));
  return {
    items: list.map((e) => ({
      id: sid(e._id),
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      cancelled: e.cancelled,
      audience: e.audience,
      coverImage: e.coverImage,
      goingCount: e.goingCount,
      country: e.country,
      city: e.city,
      online: e.online,
      host: hosts.get(sid(e.hostId)) ?? null,
      community: e.communityId ? (cById.get(sid(e.communityId)) ?? null) : null,
      imported: !!e.sourceUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    page: q.page,
    hasMore: rows.length > size,
  };
}

export async function setEventCancelled(admin: IUser, id: string, cancelled: boolean, note = "") {
  const e = await Event.findByIdAndUpdate(id, { cancelled }, { new: true }).lean<IEvent>();
  if (!e) throw notFound("That event is gone.");
  await logAction(admin, cancelled ? "event.cancel" : "event.restore", "event", e._id, e.title, note, `/events/${sid(e._id)}`);
  return { cancelled: e.cancelled };
}

export async function adminDeleteEvent(admin: IUser, id: string, note = "") {
  const e = await Event.findById(id).lean<IEvent>();
  if (!e) throw notFound("That event is gone.");
  await purgeEvent(e);
  await logAction(admin, "event.delete", "event", e._id, e.title, note, null);
  return { deleted: true };
}

/* ---------------------------- communities --------------------------- */

export async function listAdminCommunities(q: { q: string; sort: "members" | "new"; page: number }): Promise<Paginated<AdminCommunityRow>> {
  const size = 25;
  const filter = q.q.trim() ? { $or: [{ name: new RegExp(escapeRegex(q.q.trim()), "i") }, { slug: new RegExp(escapeRegex(q.q.trim()), "i") }] } : {};
  const rows = await Community.find(filter)
    .sort(q.sort === "new" ? { createdAt: -1 } : { memberCount: -1, createdAt: -1 })
    .skip((q.page - 1) * size)
    .limit(size + 1)
    .lean<ICommunity[]>();
  const list = rows.slice(0, size);
  const owners = await loadBriefs(list.map((c) => c.ownerId));
  return {
    items: list.map((c) => ({
      id: sid(c._id),
      slug: c.slug,
      name: c.name,
      interest: c.interest,
      privacy: c.privacy,
      memberCount: c.memberCount,
      coverImage: c.coverImage,
      country: c.country,
      city: c.city,
      owner: owners.get(sid(c.ownerId)) ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    page: q.page,
    hasMore: rows.length > size,
  };
}

export async function adminDeleteCommunity(admin: IUser, id: string, note = "") {
  const c = await Community.findById(id).lean<ICommunity>();
  if (!c) throw notFound("That community is gone.");
  await purgeCommunity(c);
  await logAction(admin, "community.delete", "community", c._id, c.name, note, null);
  return { deleted: true };
}

/* ----------------------------- overview ----------------------------- */

/** The tab counts in the admin menu. */
export async function adminSummary(): Promise<AdminSummaryDTO> {
  const [reports, pendingDrafts] = await Promise.all([reportCounts(), EventDraft.countDocuments({ status: "pending" })]);
  return { reports, pendingDrafts };
}

export async function adminOverview(): Promise<AdminOverviewDTO> {
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d14 = new Date(now - 14 * DAY);
  const start = new Date(new Date(now - 29 * DAY).toISOString().slice(0, 10));
  const min = LARGE_COMMUNITY;
  const [
    total, new7d, newPrev7d, suspended, unverified,
    upcoming, thisWeek, created7d, imported,
    communities, communitiesNew7d, large,
    openReports, pendingDrafts, perDay, recent,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: d7 } }),
    User.countDocuments({ createdAt: { $gte: d14, $lt: d7 } }),
    User.countDocuments({ suspendedAt: { $ne: null } }),
    User.countDocuments({ emailVerifiedAt: null }),
    Event.countDocuments({ cancelled: false, startsAt: { $gte: new Date(now) } }),
    Event.countDocuments({ cancelled: false, startsAt: { $gte: new Date(now), $lt: new Date(now + 7 * DAY) } }),
    Event.countDocuments({ createdAt: { $gte: d7 } }),
    Event.countDocuments({ sourceUrl: { $nin: [null, ""] } }),
    Community.countDocuments({}),
    Community.countDocuments({ createdAt: { $gte: d7 } }),
    Community.countDocuments({ memberCount: { $gte: min } }),
    Report.countDocuments({ status: "open" }),
    EventDraft.countDocuments({ status: "pending" }),
    User.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
    ]),
    AdminAction.find().sort({ createdAt: -1 }).limit(8).lean<IAdminAction[]>(),
  ]);
  const byDay = new Map(perDay.map((d) => [d._id, d.n]));
  const signups = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(+start + i * DAY).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });
  return {
    people: { total, new7d, newPrev7d, suspended, unverified },
    events: { upcoming, thisWeek, created7d, imported },
    communities: { total: communities, new7d: communitiesNew7d, large },
    queue: { openReports, pendingDrafts },
    signups,
    recent: await toAudit(recent),
    hostMinMembers: min,
  };
}

/* ------------------------------ system ------------------------------ */

/** What's switched on, for the System page. Never returns a secret, only whether one is set. */
export function systemStatus(): SystemStatusDTO {
  const r2 = r2Config();
  const smtp = smtpConfig();
  const redis = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
  return {
    checks: [
      { id: "email", label: "Email sending", ok: !!smtp, detail: smtp ? `Sending through ${smtp.host}` : "SMTP isn't set up: emails are printed to the server log and email verification is off." },
      { id: "google", label: "Sign in with Google", ok: !!googleConfig(), detail: googleConfig() ? "Google sign-in is on." : "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set.", optional: true },
      { id: "uploads", label: "Picture & video uploads", ok: !!r2, detail: r2 ? `Stored in Cloudflare R2 (bucket “${r2.bucket}”), resized and compressed on the device first.` : "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL aren't all set, so uploads are off (people can still paste picture links)." },
      { id: "realtime", label: "Live chat updates", ok: !!ablyKey(), detail: ablyKey() ? "Ably is connected." : "ABLY_API_KEY isn't set: chats refresh by polling.", optional: true },
      { id: "voice", label: "Voice channels", ok: !!livekitConfig(), detail: livekitConfig() ? "LiveKit is connected." : "LiveKit isn't set up, so voice channels are off.", optional: true },
      { id: "cache", label: "Shared cache & rate limits", ok: redis, detail: redis ? "Upstash Redis is connected." : "No Redis: rate limits are per server instance.", optional: true },
      { id: "webpush", label: "Browser notifications", ok: !!webPushConfig(), detail: webPushConfig() ? "Desktop and web-app notifications are on." : "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY aren't set, so desktop and browser notifications are off." },
      { id: "support", label: "Support email", ok: !!process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim(), detail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ? `Shown on Terms and Privacy: ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL.trim()}` : "NEXT_PUBLIC_SUPPORT_EMAIL isn't set, so Terms and Privacy have no contact address." },
      { id: "paystack", label: "Paid promotions (Paystack)", ok: !!paystackConfig(), detail: paystackConfig() ? `Hosts can pay to promote events (₦${promotionPricePerDay().toLocaleString()}/day for a city${promotionReview() ? ", approved by you first" : ""}).` : "PAYSTACK_SECRET_KEY isn't set, so hosts can't buy promotions. You can still create promoted events yourself in Ads.", optional: true },
      { id: "cron", label: "Scheduled jobs", ok: !!cronSecret(), detail: cronSecret() ? "CRON_SECRET is set: reminders, cleanup and the nightly event finder can run." : "CRON_SECRET isn't set, so reminders, cleanup and the nightly event finder won't run." },
    ],
    admins: [...adminEmails()],
    appUrl: appUrl(),
    environment: isProd() ? "production" : "development",
  };
}
