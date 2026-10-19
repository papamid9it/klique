import { after } from "next/server";
import type { Types } from "mongoose";
import { expoAccessToken } from "../env";
import { PushToken } from "../models/PushToken";
import type { IUser } from "../models/User";
import { sid } from "./helpers";

/**
 * Phone notifications through Expo's push service (it talks to Apple and Google for us, no keys in this app).
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

async function deliver(userIds: (Types.ObjectId | string)[], p: PushPayload) {
  const ids = [...new Set(userIds.map(sid))];
  if (!ids.length) return;
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

/** Send after the response has gone out (and keep serverless functions alive until it's done). */
export function notify(userIds: (Types.ObjectId | string)[], payload: PushPayload) {
  if (!userIds.length) return;
  const run = () => deliver(userIds, payload).catch((err) => console.warn("[push]", (err as Error)?.message));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Await-able version for the reminder job (it already runs inside its own request). */
export const notifyNow = deliver;
