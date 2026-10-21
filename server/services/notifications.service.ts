import "server-only";
import type { Types } from "mongoose";
import { NOTIFY_CATEGORY_IDS, notifyPrefsOf, type NotifyPrefs } from "@/lib/notifications";
import type { NotificationDTO, Paginated } from "@/lib/types";
import { Notification, type INotification } from "../models/Notification";
import { User, type IUser } from "../models/User";
import { publish, rtChannel } from "./realtime";
import { sid } from "./helpers";

/** The bell: your notification inbox, its unread count, and what you want to hear about. */

export const unreadNotificationCount = (userId: Types.ObjectId | string) => Notification.countDocuments({ userId, read: false });

const toDto = (n: INotification): NotificationDTO => ({ id: sid(n._id), category: n.category, title: n.title, body: n.body, href: n.href, count: n.count, read: n.read, updatedAt: n.updatedAt.toISOString() });

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
  return { items: rows.slice(0, PAGE).map(toDto), page: 1, hasMore: rows.length > PAGE, unread: by.reduce((s, b) => s + b.n, 0), unreadBy };
}

/** Mark some (or all) as read. Your other open tabs update their bell too. */
export async function markNotificationsRead(viewer: IUser, input: { ids?: string[]; all?: boolean }) {
  if (input.all) await Notification.updateMany({ userId: viewer._id, read: false }, { $set: { read: true } });
  else if (input.ids?.length) await Notification.updateMany({ userId: viewer._id, _id: { $in: input.ids } }, { $set: { read: true } });
  const unread = await unreadNotificationCount(viewer._id);
  publish([rtChannel.user(viewer._id)], { type: "notify", category: "read", ref: null, inbox: true });
  return { unread };
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
