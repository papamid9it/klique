import { after } from "next/server";
import type { Types } from "mongoose";
import webpush from "web-push";
import { expoAccessToken, webPushConfig } from "../env";
import { PushToken } from "../models/PushToken";
import { WebPushSubscription, type IWebPushSubscription } from "../models/WebPushSubscription";
import { User, type IUser } from "../models/User";
import { Notification, type NotifyAction } from "../models/Notification";
import { notifyPrefsOf, type NotifyCategory } from "@/lib/notifications";
import { publish, rtChannel } from "./realtime";
import { sid } from "./helpers";

/**
 * Notifications to phones (the mobile app, through Expo's push service: it talks to Apple and Google for us)
 * and to browsers (desktop and phone browsers and the installed web app, through standard Web Push).
 * Everything here is fire-and-forget: a failed push never fails the request that caused it, and with no
 * registered phones it does nothing.
 */
const ENDPOINT = "https://exp.host/--/api/v2/push/send";
const TOKEN_RX = /^(Exponent|Expo)PushToken\[[\w-]+\]$/;

export interface PushPayload {
  title: string;
  body: string;
  /** what the app opens when tapped: { type: "dm", conversationId } | { type: "channel", ... } | { type: "event", id } */
  data: Record<string, string>;
}

export async function registerPushToken(viewer: IUser, token: string, platform: "ios" | "android") {
  if (!TOKEN_RX.test(token)) return { registered: false };
  // a phone belongs to whoever is signed in on it now
  await PushToken.updateOne({ token }, { $set: { userId: viewer._id, platform } }, { upsert: true });
  return { registered: true };
}

export async function removePushToken(viewer: IUser, token: string) {
  await PushToken.deleteOne({ token, userId: viewer._id });
  return { removed: true };
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Where tapping the notification takes you in the web app. */
export function urlFor(data: Record<string, string>): string {
  if (data.href) return data.href;
  switch (data.type) {
    case "event":
      return `/events/${data.id}`;
    case "crew":
      return `/crews/${data.id}`;
    case "dm":
      return `/messages/${data.conversationId}`;
    case "group":
      return `/communities/${data.communitySlug}?g=${data.subSlug}`;
    case "channel":
      return `/communities/${data.communitySlug}?${new URLSearchParams({ ...(data.subSlug ? { g: data.subSlug } : {}), c: data.channelSlug })}`;
    default:
      return "/";
  }
}

/* --------------------------- browsers ---------------------------- */

const LABEL_MAX = 80;

export function webPushPublicKey(): string | null {
  return webPushConfig()?.publicKey ?? null;
}

export async function registerWebPush(viewer: IUser, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string) {
  if (!webPushConfig()) return { registered: false };
  // a browser belongs to whoever is signed in on it now
  await WebPushSubscription.updateOne({ endpoint: sub.endpoint }, { $set: { userId: viewer._id, keys: sub.keys, label: label.slice(0, LABEL_MAX) } }, { upsert: true });
  return { registered: true };
}

export async function removeWebPush(viewer: IUser, endpoint: string) {
  await WebPushSubscription.deleteOne({ endpoint, userId: viewer._id });
  return { removed: true };
}

async function deliverWeb(ids: string[], p: PushPayload) {
  const cfg = webPushConfig();
  if (!cfg) return;
  const subs = await WebPushSubscription.find({ userId: { $in: ids } }).lean<IWebPushSubscription[]>();
  if (!subs.length) return;
  const payload = JSON.stringify({ title: clip(p.title, 60), body: clip(p.body), url: urlFor(p.data), tag: `${p.data.type}:${p.data.id ?? p.data.conversationId ?? p.data.channelSlug ?? ""}` });
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { vapidDetails: cfg, TTL: 60 * 60 * 6, urgency: "high" });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // the browser unsubscribed or the subscription expired: forget it
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else console.warn("[push] web send failed:", status ?? (err as Error)?.message);
      }
    }),
  );
  if (dead.length) await WebPushSubscription.deleteMany({ endpoint: { $in: dead } });
}

/* ---------------------------- phones ----------------------------- */

async function deliver(userIds: (Types.ObjectId | string)[], p: PushPayload) {
  const ids = [...new Set(userIds.map(sid))];
  if (!ids.length) return;
  await Promise.all([deliverPhones(ids, p), deliverWeb(ids, p)]);
}

async function deliverPhones(ids: string[], p: PushPayload) {
  const rows = await PushToken.find({ userId: { $in: ids } }).select("token").lean<{ token: string }[]>();
  if (!rows.length) return;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const key = expoAccessToken();
  if (key) headers.Authorization = `Bearer ${key}`;

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const messages = chunk.map((r) => ({ to: r.token, title: clip(p.title, 60), body: clip(p.body), data: p.data, sound: "default", priority: "high", channelId: "default" }));
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(messages) });
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      // phones that uninstalled the app: forget them
      const dead = (json.data ?? []).flatMap((t, idx) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? [chunk[idx].token] : []));
      if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
    } catch (err) {
      console.warn("[push] send failed:", (err as Error)?.message);
    }
  }
}

/* ------------------------- the inbox ----------------------------- */

/** What kind of notification this is, for the person's settings and for bundling. */
export interface NotifyMeta {
  category: NotifyCategory;
  /** bundle with an unread notification that has the same key ("crew-req:<id>") instead of adding a new line */
  groupKey?: string;
  /** the wording once `n` have bundled, e.g. n => `${n} people want to join your crew` */
  many?: (n: number) => string;
  /** what changed, so open pages can refresh themselves: "crew:<id>", "community:<id>", "topic:<id>"… */
  ref?: string;
  /**
   * With `groupKey`: push only the first one of a bundle (while it sits unread, later ones just update the
   * inbox line). For chatty things like crew chat.
   */
  pushOnce?: boolean;
  /** who did it: their face shows on the inbox line ("Ngozi and 2 others") */
  actorId?: Types.ObjectId | string;
  /** a picture for the inbox line (an event's cover) */
  image?: string | null;
  /** answered right from the inbox line: Accept / Decline, Going */
  action?: NotifyAction;
}

const INBOX_DAYS = 60;

async function toInbox(ids: string[], p: PushPayload, meta: NotifyMeta) {
  const href = urlFor(p.data);
  const expiresAt = new Date(Date.now() + INBOX_DAYS * 24 * 60 * 60 * 1000);
  await Promise.all(
    ids.map(async (userId) => {
      if (meta.groupKey) {
        const open = await Notification.findOne({ userId, groupKey: meta.groupKey, read: false }).select("count actorIds").lean<{ _id: Types.ObjectId; count: number; actorIds?: Types.ObjectId[] }>();
        if (open) {
          const count = open.count + 1;
          // the newest three different people, newest first
          const actorIds = meta.actorId ? [String(meta.actorId), ...(open.actorIds ?? []).map(String).filter((a) => a !== String(meta.actorId))].slice(0, 3) : open.actorIds;
          await Notification.updateOne({ _id: open._id }, { $set: { title: meta.many?.(count) ?? p.title, body: p.body, href, expiresAt, actorIds, ...(meta.image !== undefined ? { image: meta.image } : {}), action: count > 1 && meta.action?.kind !== "event" ? null : (meta.action ?? null) }, $inc: { count: 1 } });
          return;
        }
      }
      await Notification.create({ userId, category: meta.category, title: p.title, body: p.body, href, groupKey: meta.groupKey ?? null, expiresAt, actorIds: meta.actorId ? [meta.actorId] : [], image: meta.image ?? null, action: meta.action ?? null });
    }),
  );
}

/**
 * Tell people about something, the way each of them asked: an inbox entry (the bell), a push to their phone
 * and browsers, or neither (Settings → Notifications). Open tabs get a realtime ping either way, so whatever
 * they're looking at refreshes itself. Without `meta` it's a plain push (kept for old callers).
 */
async function fanOut(userIds: (Types.ObjectId | string)[], p: PushPayload, meta?: NotifyMeta) {
  const ids = [...new Set(userIds.map(sid))];
  if (!ids.length) return;
  if (!meta) return deliver(ids, p);
  const rows = await User.find({ _id: { $in: ids } }).select("notifyPrefs").lean<Pick<IUser, "_id" | "notifyPrefs">[]>();
  const inApp: string[] = [];
  let push: string[] = [];
  for (const u of rows) {
    const pref = notifyPrefsOf(u.notifyPrefs)[meta.category];
    if (pref.inApp) inApp.push(sid(u._id));
    if (pref.push) push.push(sid(u._id));
  }
  if (meta.pushOnce && meta.groupKey && push.length) {
    // already buzzed for this bundle and they haven't looked yet: don't buzz again
    const open = await Notification.find({ userId: { $in: push }, groupKey: meta.groupKey, read: false }).select("userId").lean<{ userId: Types.ObjectId }[]>();
    const skip = new Set(open.map((o) => sid(o.userId)));
    push = push.filter((id) => !skip.has(id));
  }
  await Promise.all([inApp.length ? toInbox(inApp, p, meta) : null, push.length ? deliver(push, p) : null]);
  publish(
    ids.map((id) => rtChannel.user(id)),
    { type: "notify", category: meta.category, ref: meta.ref ?? null, inbox: inApp.length > 0 },
  );
}

/** Send after the response has gone out (and keep serverless functions alive until it's done). */
export function notify(userIds: (Types.ObjectId | string)[], payload: PushPayload, meta?: NotifyMeta) {
  if (!userIds.length) return;
  const run = () => fanOut(userIds, payload, meta).catch((err) => console.warn("[notify]", (err as Error)?.message));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Await-able version for the reminder job (it already runs inside its own request). */
export const notifyNow = fanOut;
