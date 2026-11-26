import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Types } from "mongoose";
import { ApiError, badRequest } from "../http/errors";
import { appUrl, authSecret, twitchConfig } from "../env";
import { TwitchLink, type ITwitchLink } from "../models/Live";
import type { IUser } from "../models/User";
import { open, seal } from "./secret-box";

/**
 * "Connect Twitch": someone signs in to Twitch from Klique once, so they can go live from Klique (Klique sets the
 * stream's title, shows their stream key for OBS, and the app streams the phone's camera straight to Twitch), and so
 * Twitch tells Klique the moment their channel goes live or off (EventSub), to show LIVE in their community and tell
 * its members. Their Twitch sign-in is kept sealed (secret-box) and renewed by itself.
 */

const AUTH = "https://id.twitch.tv/oauth2";
const HELIX = "https://api.twitch.tv/helix";
/** read the stream key (OBS, the phone's camera) and set the stream's title */
const SCOPES = ["channel:read:stream_key", "channel:manage:broadcast"];
/** Twitch's ingest, the same for every channel: add the stream key */
export const TWITCH_INGEST = "rtmp://live.twitch.tv/app";

function config() {
  const c = twitchConfig();
  if (!c) throw new ApiError(503, "Twitch isn't set up on Klique yet.", { code: "twitch_not_configured" });
  return c;
}
export const twitchReady = () => !!twitchConfig();
const redirectUri = () => `${appUrl()}/api/twitch/callback`;

/* ------------------------------ connecting ------------------------------ */

/** Where "Connect Twitch" sends them: Twitch's sign-in, with a signed note of who asked (and where to come back to). */
export async function twitchConnectUrl(viewer: IUser, back: string): Promise<string> {
  const c = config();
  const state = await new SignJWT({ sub: String(viewer._id), back: back.startsWith("/") || back.startsWith("klique://") ? back : "/settings", n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(authSecret());
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(" "), state, force_verify: "true" });
  return `${AUTH}/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const c = config();
  const res = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }) });
  if (!res.ok) throw badRequest("Twitch didn't accept that. Try connecting again.");
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

/** Back from Twitch: check who asked, swap the code for their sign-in, keep it sealed, and listen for them going live. */
export async function twitchCallback(code: string, state: string): Promise<{ userId: string; back: string }> {
  let who: { sub?: string; back?: string };
  try {
    who = (await jwtVerify(state, authSecret())).payload as { sub?: string; back?: string };
  } catch {
    throw badRequest("That Twitch link ran out. Try connecting again.");
  }
  if (!who.sub) throw badRequest("That Twitch link isn't right. Try connecting again.");
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  const me = await helix<{ data: { id: string; login: string; display_name: string; profile_image_url: string }[] }>("/users", t.access_token);
  const u = me.data[0];
  if (!u) throw badRequest("Twitch didn't say who you are. Try again.");
  // a Twitch channel belongs to one Klique account: connecting it here takes it off any other
  const others = await TwitchLink.find({ twitchId: u.id, userId: { $ne: who.sub } }).lean<ITwitchLink[]>();
  for (const o of others) await disconnectLink(o);
  const subscriptionIds = await subscribeLive(u.id).catch(() => [] as string[]);
  await TwitchLink.updateOne(
    { userId: who.sub },
    { $set: { twitchId: u.id, login: u.login, displayName: u.display_name, avatarUrl: u.profile_image_url || null, accessToken: seal(t.access_token), refreshToken: seal(t.refresh_token ?? ""), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000), subscriptionIds } },
    { upsert: true },
  );
  return { userId: who.sub, back: who.back ?? "/settings" };
}

/** Disconnect: Twitch forgets Klique's sign-in, and stops telling us about the channel. */
export async function twitchDisconnect(userId: Types.ObjectId) {
  const link = await TwitchLink.findOne({ userId }).lean<ITwitchLink>();
  if (link) await disconnectLink(link);
  return { connected: false };
}

async function disconnectLink(link: ITwitchLink) {
  const c = twitchConfig();
  if (c) {
    const token = open(link.accessToken);
    if (token) await fetch(`${AUTH}/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId, token }) }).catch(() => {});
    const app = await appToken().catch(() => null);
    if (app) for (const id of link.subscriptionIds ?? []) await fetch(`${HELIX}/eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${app}`, "Client-Id": c.clientId } }).catch(() => {});
  }
  await TwitchLink.deleteOne({ _id: link._id });
}

/* ------------------------------ using it ------------------------------ */

async function helix<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const c = config();
  const res = await fetch(`${HELIX}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Client-Id": c.clientId, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  if (res.status === 401) throw new ApiError(401, "Twitch needs you to connect again.", { code: "twitch_reconnect" });
  if (!res.ok && res.status !== 204) throw new ApiError(502, `Twitch isn't answering right now (${res.status}).`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** Their Twitch sign-in, renewed first when it's about to run out. Null: not connected. */
async function userToken(userId: Types.ObjectId): Promise<{ link: ITwitchLink; token: string } | null> {
  const link = await TwitchLink.findOne({ userId }).lean<ITwitchLink>();
  if (!link) return null;
  if (+link.expiresAt > Date.now()) {
    const token = open(link.accessToken);
    if (token) return { link, token };
  }
  const refresh = open(link.refreshToken);
  if (!refresh) throw new ApiError(401, "Twitch needs you to connect again.", { code: "twitch_reconnect" });
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh }).catch(() => {
    throw new ApiError(401, "Twitch needs you to connect again.", { code: "twitch_reconnect" });
  });
  await TwitchLink.updateOne({ _id: link._id }, { $set: { accessToken: seal(t.access_token), ...(t.refresh_token ? { refreshToken: seal(t.refresh_token) } : {}), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000) } });
  return { link, token: t.access_token };
}

/** Their connected channel, for Settings and "Go live" (no secrets). */
export async function twitchStatus(viewer: IUser) {
  const link = await TwitchLink.findOne({ userId: viewer._id }).select("login displayName avatarUrl").lean<Pick<ITwitchLink, "login" | "displayName" | "avatarUrl">>();
  return { ready: twitchReady(), connected: !!link, login: link?.login ?? null, displayName: link?.displayName ?? null, avatarUrl: link?.avatarUrl ?? null };
}

/** Where to stream (OBS, or the app's camera): Twitch's ingest and their stream key. Only for them. */
export async function twitchStreamKey(viewer: IUser): Promise<{ server: string; key: string; url: string }> {
  const t = await userToken(viewer._id);
  if (!t) throw badRequest("Connect Twitch first.");
  const r = await helix<{ data: { stream_key: string }[] }>(`/streams/key?broadcaster_id=${t.link.twitchId}`, t.token);
  const key = r.data[0]?.stream_key;
  if (!key) throw new ApiError(502, "Twitch didn't send your stream key. Try again.");
  return { server: TWITCH_INGEST, key, url: `${TWITCH_INGEST}/${key}` };
}

/** Puts the title on their Twitch channel (what people see there too). Best effort: going live works without it. */
export async function twitchSetTitle(userId: Types.ObjectId, title: string) {
  const t = await userToken(userId).catch(() => null);
  if (!t || !title.trim()) return;
  await helix(`/channels?broadcaster_id=${t.link.twitchId}`, t.token, { method: "PATCH", body: JSON.stringify({ title: title.trim().slice(0, 140) }) }).catch(() => {});
}

export async function twitchLinkOf(userId: Types.ObjectId) {
  return TwitchLink.findOne({ userId }).select("twitchId login").lean<Pick<ITwitchLink, "twitchId" | "login">>();
}

/* ------------------------------ Twitch telling us ------------------------------ */

let app: { token: string; until: number } | null = null;
/** Klique's own Twitch token (for EventSub), kept until it nearly runs out. */
async function appToken(): Promise<string> {
  if (app && app.until > Date.now()) return app.token;
  const t = await tokenRequest({ grant_type: "client_credentials" });
  app = { token: t.access_token, until: Date.now() + (t.expires_in - 300) * 1000 };
  return app.token;
}

/** Asks Twitch to tell us when this channel goes live and when it goes off. */
async function subscribeLive(twitchId: string): Promise<string[]> {
  const c = config();
  const token = await appToken();
  const ids: string[] = [];
  for (const type of ["stream.online", "stream.offline"]) {
    const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Client-Id": c.clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ type, version: "1", condition: { broadcaster_user_id: twitchId }, transport: { method: "webhook", callback: `${appUrl()}/api/twitch/eventsub`, secret: c.eventsubSecret } }),
    });
    if (res.ok) {
      const j = (await res.json()) as { data?: { id: string }[] };
      if (j.data?.[0]?.id) ids.push(j.data[0].id);
    }
  }
  return ids;
}

/** Checks a message really came from Twitch (its signature, and not older than 10 minutes). */
export function verifyEventSub(headers: Headers, raw: string): boolean {
  const c = twitchConfig();
  if (!c) return false;
  const id = headers.get("twitch-eventsub-message-id") ?? "";
  const at = headers.get("twitch-eventsub-message-timestamp") ?? "";
  const sig = headers.get("twitch-eventsub-message-signature") ?? "";
  if (!id || !at || !sig || Math.abs(Date.now() - Date.parse(at)) > 10 * 60 * 1000) return false;
  const mine = `sha256=${createHmac("sha256", c.eventsubSecret).update(id + at + raw).digest("hex")}`;
  const a = Buffer.from(mine);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Is this channel live on Twitch right now (for going live in Klique after already starting on Twitch)? */
export async function twitchIsLive(twitchId: string): Promise<boolean> {
  const c = twitchConfig();
  if (!c) return false;
  const token = await appToken().catch(() => null);
  if (!token) return false;
  const res = await fetch(`${HELIX}/streams?user_id=${encodeURIComponent(twitchId)}`, { headers: { Authorization: `Bearer ${token}`, "Client-Id": c.clientId } }).catch(() => null);
  if (!res?.ok) return false;
  const j = (await res.json()) as { data?: unknown[] };
  return !!j.data?.length;
}
