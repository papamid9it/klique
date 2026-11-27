import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Types } from "mongoose";
import { ApiError, badRequest } from "../http/errors";
import { appUrl, authSecret, googleConfig } from "../env";
import { YouTubeLink, YouTubeQuota, type IYouTubeLink } from "../models/Live";
import type { IUser } from "../models/User";
import { open, seal } from "./secret-box";

/**
 * "Connect YouTube": someone signs in with Google once (YouTube access only, asked for then, never at sign-in), so
 * the app can stream the phone's camera to their own YouTube channel: Klique makes a live broadcast and its stream
 * address on their channel, the app sends the camera there, and YouTube starts and stops the broadcast by itself.
 * Everyone watches it in Klique (the YouTube player beside the community's chat).
 *
 * YouTube allows 10,000 units a day (each live costs about 150-200). Klique counts what it uses; near the limit, or
 * once YouTube says it's used up, going live by pasting a YouTube link is offered instead until midnight Pacific.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const DAILY = 10_000;
/** what one go-live costs (a broadcast, a stream, binding them) plus a little to spare */
const PER_LIVE = 200;

function config() {
  const c = googleConfig();
  if (!c) throw new ApiError(503, "YouTube isn't set up on Klique yet.", { code: "youtube_not_configured" });
  return c;
}
export const youtubeReady = () => !!googleConfig();
const redirectUri = () => `${appUrl().replace("://getklique.app", "://www.getklique.app")}/api/live/youtube/callback`;

/* ------------------------------ the daily allowance ------------------------------ */

/** Today in YouTube's sense (its allowance resets at midnight Pacific time). */
const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

/** Is there enough of today's allowance left for one more go-live? */
export async function youtubeHasRoom(): Promise<boolean> {
  const q = await YouTubeQuota.findById(quotaDay()).lean<{ used: number; out: boolean }>();
  return !q || (!q.out && q.used + PER_LIVE <= DAILY * 0.95);
}
const spend = (units: number) => YouTubeQuota.updateOne({ _id: quotaDay() }, { $inc: { used: units } }, { upsert: true }).catch(() => {});
const usedUp = () => YouTubeQuota.updateOne({ _id: quotaDay() }, { $set: { out: true } }, { upsert: true }).catch(() => {});
const busy = () => new ApiError(429, "YouTube is busy today. Paste your YouTube live link instead (start the stream in the YouTube app first).", { code: "youtube_busy" });

/* ------------------------------ connecting ------------------------------ */

export async function youtubeConnectUrl(viewer: IUser, back: string): Promise<string> {
  const c = config();
  const state = await new SignJWT({ sub: String(viewer._id), back: back.startsWith("/") || back.startsWith("klique://") ? back : "/settings", n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(authSecret());
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent select_account", include_granted_scopes: "false", state });
  return `${AUTH}?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const c = config();
  const res = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }) });
  if (!res.ok) throw badRequest("Google didn't accept that. Try connecting again.");
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

/** Back from Google: check who asked, keep their YouTube sign-in sealed, and note their channel. */
export async function youtubeCallback(code: string, state: string): Promise<{ back: string }> {
  let who: { sub?: string; back?: string };
  try {
    who = (await jwtVerify(state, authSecret())).payload as { sub?: string; back?: string };
  } catch {
    throw badRequest("That YouTube link ran out. Try connecting again.");
  }
  if (!who.sub) throw badRequest("That YouTube link isn't right. Try connecting again.");
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (t.scope && !t.scope.includes("youtube")) throw badRequest("Klique needs permission to manage your YouTube live streams. Try again and allow it.");
  const me = await yt<{ items?: { id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }[] }>("/channels?part=snippet&mine=true", t.access_token, 1);
  const ch = me.items?.[0];
  if (!ch) throw badRequest("That Google account has no YouTube channel. Make one on YouTube, then connect again.");
  // a channel belongs to one Klique account
  await YouTubeLink.deleteMany({ channelId: ch.id, userId: { $ne: who.sub } });
  await YouTubeLink.updateOne(
    { userId: who.sub },
    { $set: { channelId: ch.id, title: ch.snippet.title, avatarUrl: ch.snippet.thumbnails?.default?.url ?? null, accessToken: seal(t.access_token), ...(t.refresh_token ? { refreshToken: seal(t.refresh_token) } : {}), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000) }, $setOnInsert: t.refresh_token ? {} : { refreshToken: seal("") } },
    { upsert: true },
  );
  return { back: who.back ?? "/settings" };
}

export async function youtubeDisconnect(userId: Types.ObjectId) {
  const link = await YouTubeLink.findOne({ userId }).lean<IYouTubeLink>();
  if (link) {
    const token = open(link.refreshToken) || open(link.accessToken);
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
    await YouTubeLink.deleteOne({ _id: link._id });
  }
  return { connected: false };
}

/* ------------------------------ using it ------------------------------ */

/** A YouTube API call, counting what it costs; "used up" and "live streaming off" come back as plain answers. */
async function yt<T>(path: string, token: string, cost: number, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  void spend(cost);
  if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; message?: string } };
  const reason = body.error?.errors?.[0]?.reason ?? "";
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") {
    await usedUp();
    throw busy();
  }
  if (reason === "liveStreamingNotEnabled" || reason === "insufficientLivePermissions") throw new ApiError(400, "Live streaming isn't on for your YouTube channel yet. Turn it on in YouTube Studio → Go live (the first time can take up to 24 hours).", { code: "youtube_live_off" });
  if (res.status === 401) throw new ApiError(401, "YouTube needs you to connect again.", { code: "youtube_reconnect" });
  throw new ApiError(502, `YouTube isn't answering right now (${res.status}).`);
}

async function userToken(userId: Types.ObjectId): Promise<{ link: IYouTubeLink; token: string } | null> {
  const link = await YouTubeLink.findOne({ userId }).lean<IYouTubeLink>();
  if (!link) return null;
  if (+link.expiresAt > Date.now()) {
    const token = open(link.accessToken);
    if (token) return { link, token };
  }
  const refresh = open(link.refreshToken);
  if (!refresh) throw new ApiError(401, "YouTube needs you to connect again.", { code: "youtube_reconnect" });
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh }).catch(() => {
    throw new ApiError(401, "YouTube needs you to connect again.", { code: "youtube_reconnect" });
  });
  await YouTubeLink.updateOne({ _id: link._id }, { $set: { accessToken: seal(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in - 120) * 1000) } });
  return { link, token: t.access_token };
}

/** Your YouTube connection (no secrets), and whether going live through it is possible today. */
export async function youtubeStatus(viewer: IUser) {
  const link = await YouTubeLink.findOne({ userId: viewer._id }).select("title avatarUrl").lean<Pick<IYouTubeLink, "title" | "avatarUrl">>();
  return { ready: youtubeReady(), connected: !!link, title: link?.title ?? null, avatarUrl: link?.avatarUrl ?? null, available: await youtubeHasRoom() };
}

/**
 * Get a live broadcast ready on their channel: the broadcast (public, starting and stopping by itself when the camera
 * starts and stops), its stream address, bound together. The app streams the camera to `url`; `broadcastId` is the
 * video people watch.
 */
export async function youtubeBroadcast(viewer: IUser, title: string): Promise<{ broadcastId: string; url: string }> {
  if (!(await youtubeHasRoom())) throw busy();
  const t = await userToken(viewer._id);
  if (!t) throw badRequest("Connect YouTube first.");
  const name = (title.trim() || `${viewer.displayName} on Klique`).slice(0, 100);
  const b = await yt<{ id: string }>("/liveBroadcasts?part=snippet,status,contentDetails", t.token, 50, {
    method: "POST",
    body: JSON.stringify({
      snippet: { title: name, scheduledStartTime: new Date().toISOString() },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true, latencyPreference: "low", enableDvr: true, recordFromStart: true },
    }),
  });
  const s = await yt<{ id: string; cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } } }>("/liveStreams?part=snippet,cdn,contentDetails", t.token, 50, {
    method: "POST",
    body: JSON.stringify({ snippet: { title: `${name} (Klique)` }, cdn: { ingestionType: "rtmp", resolution: "variable", frameRate: "variable" }, contentDetails: { isReusable: false } }),
  });
  await yt(`/liveBroadcasts/bind?id=${encodeURIComponent(b.id)}&part=id&streamId=${encodeURIComponent(s.id)}`, t.token, 50, { method: "POST" });
  return { broadcastId: b.id, url: `${s.cdn.ingestionInfo.ingestionAddress}/${s.cdn.ingestionInfo.streamName}` };
}

/** Is that broadcast theirs? (Before it's shown as their stream in a community.) */
export async function youtubeOwnsBroadcast(userId: Types.ObjectId, broadcastId: string): Promise<boolean> {
  const t = await userToken(userId).catch(() => null);
  if (!t) return false;
  const r = await yt<{ items?: { id: string }[] }>(`/liveBroadcasts?part=id&mine=true&id=${encodeURIComponent(broadcastId)}`, t.token, 1).catch(() => ({ items: [] }));
  return !!r.items?.some((x) => x.id === broadcastId);
}

/** Ending it in Klique ends it on YouTube too (best effort: YouTube also stops it when the camera stops). */
export async function youtubeFinish(userId: Types.ObjectId, broadcastId: string) {
  const t = await userToken(userId).catch(() => null);
  if (!t) return;
  await yt(`/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(broadcastId)}&part=id`, t.token, 50, { method: "POST" }).catch(() => {});
}
