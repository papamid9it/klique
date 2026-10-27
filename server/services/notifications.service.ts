import "server-only";
import type { Types } from "mongoose";
import { NOTIFY_CATEGORY_IDS, notifyPrefsOf, type NotifyPrefs } from "@/lib/notifications";
import type { NotificationDTO, Paginated, PendingDTO } from "@/lib/types";
import { Notification, type INotification } from "../models/Notification";
import { User, type IUser } from "../models/User";
import { publish, rtChannel } from "./realtime";
import { loadBriefs } from "../serializers";
import { Crew, CrewMember } from "../models/Crew";
import { Event } from "../models/Event";
import { Community } from "../models/Community";
import { Membership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import { notFound } from "../http/errors";
import { sid } from "./helpers";

/** The bell: your notification inbox, its unread count, and what you want to hear about. */

export const unreadNotificationCount = (userId: Types.ObjectId | string) => Notification.countDocuments({ userId, read: false });

/** Lines with the faces of who did them (one batched lookup for the page). */
async function toDtos(rows: INotification[]): Promise<NotificationDTO[]> {
  const briefs = await loadBriefs(rows.flatMap((n) => n.actorIds ?? []));
  return rows.map((n) => ({
    id: sid(n._id),
    category: n.category,
    title: n.title,
    body: n.body,
    href: n.href,
    count: n.count,
    read: n.read,
    updatedAt: n.updatedAt.toISOString(),
    actors: (n.actorIds ?? []).flatMap((a) => (briefs.has(sid(a)) ? [briefs.get(sid(a))!] : [])),
    image: n.image ?? null,
    action: n.action ?? null,
  }));
}

const PAGE = 30;

/** Newest first; `before` (an ISO time) pages back; narrow to one kind, or to unread ones. Unread counts per kind come along. */
export async function listNotifications(viewer: IUser, q: { before?: string; category?: string; unread?: boolean } = {}): Promise<Paginated<NotificationDTO> & { unread: number; unreadBy: Record<string, number> }> {
  const rows = await Notification.find({
    userId: viewer._id,
    ...(q.before ? { updatedAt: { $lt: new Date(q.before) } } : {}),
    ...(q.category ? { category: q.category as INotification["category"] } : {}),
    ...(q.unread ? { read: false } : {}),
  })
    .sort({ updatedAt: -1 })
    .limit(PAGE + 1)
    .lean<INotification[]>();
  const by = await Notification.aggregate<{ _id: string; n: number }>([{ $match: { userId: viewer._id, read: false } }, { $group: { _id: "$category", n: { $sum: 1 } } }]);
  const unreadBy = Object.fromEntries(by.map((b) => [b._id, b.n]));
  return { items: await toDtos(rows.slice(0, PAGE)), page: 1, hasMore: rows.length > PAGE, unread: by.reduce((s, b) => s + b.n, 0), unreadBy };
}

/** Mark some (or all) as read. Your other open tabs update their bell too. */
export async function markNotificationsRead(viewer: IUser, input: { ids?: string[]; all?: boolean }) {
  if (input.all) await Notification.updateMany({ userId: viewer._id, read: false }, { $set: { read: true } });
  else if (input.ids?.length) await Notification.updateMany({ userId: viewer._id, _id: { $in: input.ids } }, { $set: { read: true } });
  const unread = await unreadNotificationCount(viewer._id);
  publish([rtChannel.user(viewer._id)], { type: "notify", category: "read", ref: null, inbox: true });
  return { unread };
}

/** Mark one line read or unread again. */
export async function setNotificationRead(viewer: IUser, id: string, read: boolean) {
  const res = await Notification.updateOne({ _id: id, userId: viewer._id }, { $set: { read } });
  if (!res.matchedCount) throw notFound("That notification is gone.");
  publish([rtChannel.user(viewer._id)], { type: "notify", category: "read", ref: null, inbox: true });
  return { read, unread: await unreadNotificationCount(viewer._id) };
}

/** Take a line out of your inbox. */
export async function removeNotification(viewer: IUser, id: string) {
  await Notification.deleteOne({ _id: id, userId: viewer._id });
  publish([rtChannel.user(viewer._id)], { type: "notify", category: "read", ref: null, inbox: true });
  return { removed: true, unread: await unreadNotificationCount(viewer._id) };
}

/** Join requests waiting on you: for crews you host, and for private communities you run. */
export async function pendingForMe(viewer: IUser): Promise<PendingDTO> {
  const [hosting, running] = await Promise.all([
    Crew.find({ hostId: viewer._id, expiresAt: { $gt: new Date() } }).select("_id area eventId").lean<{ _id: Types.ObjectId; area: string; eventId: Types.ObjectId }[]>(),
    Membership.find({ userId: viewer._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }).select("communityId").lean<{ communityId: Types.ObjectId }[]>(),
  ]);
  const [crewAsks, communityAsks, communities, events, toReview] = await Promise.all([
    hosting.length ? CrewMember.find({ crewId: { $in: hosting.map((c) => c._id) }, status: "pending" }).sort({ createdAt: 1 }).limit(20).lean<{ crewId: Types.ObjectId; userId: Types.ObjectId; message?: string }[]>() : [],
    running.length ? MembershipRequest.find({ communityId: { $in: running.map((m) => m.communityId) }, subcommunityId: null, status: "pending" }).sort({ createdAt: 1 }).limit(20).lean<{ _id: Types.ObjectId; communityId: Types.ObjectId; userId: Types.ObjectId; message: string }[]>() : [],
    running.length ? Community.find({ _id: { $in: running.map((m) => m.communityId) } }).select("slug name").lean<{ _id: Types.ObjectId; slug: string; name: string }[]>() : [],
    hosting.length ? Event.find({ _id: { $in: hosting.map((c) => c.eventId) } }).select("title").lean<{ _id: Types.ObjectId; title: string }[]>() : [],
    running.length ? Event.find({ communityId: { $in: running.map((m) => m.communityId) }, subcommunityId: null, review: "pending", cancelled: false }).sort({ createdAt: 1 }).limit(20).select("title hostId communityId").lean<{ _id: Types.ObjectId; title: string; hostId: Types.ObjectId; communityId: Types.ObjectId }[]>() : [],
  ]);
  const briefs = await loadBriefs([...crewAsks.map((a) => a.userId), ...communityAsks.map((a) => a.userId), ...toReview.map((e) => e.hostId)]);
  const crewById = new Map(hosting.map((c) => [sid(c._id), c]));
  const eventById = new Map(events.map((e) => [sid(e._id), e.title]));
  const communityById = new Map(communities.map((c) => [sid(c._id), c]));
  return {
    crewRequests: crewAsks.flatMap((a) => {
      const crew = crewById.get(sid(a.crewId));
      const user = briefs.get(sid(a.userId));
      return crew && user ? [{ crewId: sid(crew._id), area: crew.area, eventTitle: eventById.get(sid(crew.eventId)) ?? "", user, message: a.message ?? "" }] : [];
    }),
    communityRequests: communityAsks.flatMap((a) => {
      const c = communityById.get(sid(a.communityId));
      const user = briefs.get(sid(a.userId));
      return c && user ? [{ slug: c.slug, communityName: c.name, requestId: sid(a._id), user, message: a.message }] : [];
    }),
    eventReviews: toReview.flatMap((e) => {
      const c = communityById.get(sid(e.communityId));
      const user = briefs.get(sid(e.hostId));
      return c && user ? [{ eventId: sid(e._id), title: e.title, communityName: c.name, user }] : [];
    }),
  };
}

export function getNotifyPrefs(viewer: IUser): NotifyPrefs {
  return notifyPrefsOf(viewer.notifyPrefs);
}

export async function updateNotifyPrefs(viewer: IUser, patch: Partial<Record<string, { inApp?: boolean; push?: boolean }>>): Promise<NotifyPrefs> {
  const next = notifyPrefsOf(viewer.notifyPrefs);
  for (const id of NOTIFY_CATEGORY_IDS) {
    const p = patch[id];
    if (!p) continue;
    if (typeof p.inApp === "boolean") next[id].inApp = p.inApp;
    if (typeof p.push === "boolean") next[id].push = p.push;
  }
  await User.updateOne({ _id: viewer._id }, { $set: { notifyPrefs: next } });
  return notifyPrefsOf(next);
}
