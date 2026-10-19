import "server-only";
import type { Types } from "mongoose";
import type { AdminSummaryDTO, AdminUserDTO, ReportAction, ReportDTO, ReportStatus, ReportTargetDTO, UserBrief } from "@/lib/types";
import { eventHostMinMembers } from "../env";
import { badRequest, forbidden, notFound } from "../http/errors";
import { Channel, ChannelMessage, type IChannel, type IChannelMessage } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { EventDraft } from "../models/EventDraft";
import { Message, type IMessage } from "../models/Message";
import { Post, type IPost } from "../models/Post";
import { Rsvp, SavedEvent } from "../models/Rsvp";
import { Report, type IReport } from "../models/Safety";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import { loadBriefs, toBrief } from "../serializers";
import { escapeRegex, sid } from "./helpers";
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
      if (!e) return;
      await Promise.all([Event.deleteOne({ _id: e._id }), Rsvp.deleteMany({ eventId: e._id }), SavedEvent.deleteMany({ eventId: e._id })]);
      deleteUploads([e.coverImage]);
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
  }
}

export async function actOnReport(admin: IUser, id: string, action: ReportAction, note = "") {
  const r = await Report.findById(id).lean<IReport>();
  if (!r) throw notFound("That report is gone.");
  if (action === "reviewing") {
    await Report.updateOne({ _id: r._id }, { status: "reviewing" });
    return { status: "reviewing" as const };
  }
  if (action === "dismiss") {
    await closeAll(r, "dismissed");
    return { status: "dismissed" as const };
  }
  if (action === "remove" || action === "remove-and-suspend") await removeTarget(r, admin);
  if (action === "suspend" || action === "remove-and-suspend") {
    const who = await authorOf(r);
    if (!who) throw notFound("We couldn't find who's responsible.");
    await setSuspended(admin, sid(who), true, note || `Reported for ${r.reason}`);
  }
  await closeAll(r, "actioned");
  return { status: "actioned" as const };
}

/* ------------------------------ people ------------------------------ */

const toAdminUser = (u: IUser): AdminUserDTO => ({
  ...toBrief(u),
  email: u.email,
  isAdmin: isSiteAdmin(u),
  canHostPublic: !!u.canHostPublic,
  suspended: !!u.suspendedAt,
  suspendedReason: u.suspendedReason ?? "",
  createdAt: u.createdAt.toISOString(),
});

/** Search people by name, handle or email; with no query, the verified hosts. */
export async function searchUsers(q: string): Promise<AdminUserDTO[]> {
  const query = q.trim();
  const filter = query
    ? { $or: [{ handle: new RegExp(escapeRegex(query.replace(/^@/, "")), "i") }, { displayName: new RegExp(escapeRegex(query), "i") }, { email: new RegExp(escapeRegex(query), "i") }] }
    : { $or: [{ canHostPublic: true }, { suspendedAt: { $ne: null } }] };
  const rows = await User.find(filter).sort({ displayName: 1 }).limit(50).lean<IUser[]>();
  return rows.map(toAdminUser);
}

export async function setCanHostPublic(userId: string, on: boolean): Promise<AdminUserDTO> {
  const u = await User.findByIdAndUpdate(userId, { canHostPublic: on }, { new: true }).lean<IUser>();
  if (!u) throw notFound("We couldn't find that person.");
  return toAdminUser(u);
}

export async function setSuspended(admin: IUser, userId: string, on: boolean, reason = ""): Promise<AdminUserDTO> {
  if (userId === sid(admin._id)) throw badRequest("You can't suspend yourself.");
  const target = await User.findById(userId).lean<IUser>();
  if (!target) throw notFound("We couldn't find that person.");
  if (on && isSiteAdmin(target)) throw forbidden("Admins can't be suspended from here. Remove them from ADMIN_EMAILS first.");
  // Suspending also signs them out everywhere (tokenVersion bump invalidates every session).
  const u = await User.findByIdAndUpdate(
    userId,
    on ? { suspendedAt: new Date(), suspendedReason: reason.slice(0, 300), $inc: { tokenVersion: 1 } } : { suspendedAt: null, suspendedReason: "" },
    { new: true },
  ).lean<IUser>();
  return toAdminUser(u!);
}

/* ------------------------------ summary ----------------------------- */

/** The tab counts on /admin. */
export async function adminSummary(): Promise<AdminSummaryDTO> {
  const [reports, pendingDrafts] = await Promise.all([reportCounts(), EventDraft.countDocuments({ status: "pending" })]);
  return { reports, pendingDrafts, hostMinMembers: eventHostMinMembers() };
}
