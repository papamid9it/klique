import ApiClient from "@/app/ApiCore";
import type { ChannelDTO, Envelope, LiveDTO, LiveNowDTO, TwitchStatusDTO } from "@/lib/types";

const api = new ApiClient();

/** Live streams in communities (Twitch or a YouTube link), and your Twitch connection. */
export const LiveService = {
  twitch: () => api.get<Envelope<TwitchStatusDTO>>("/api/me/twitch"),
  /** "Live now" on Home: streams on in your communities */
  now: () => api.get<Envelope<LiveNowDTO[]>>("/api/me/live"),
  /** Twitch's sign-in page; `back`: where to land after (a Klique page, or the app's klique:// link) */
  twitchConnectUrl: (back: string) => api.get<Envelope<{ url: string }>>("/api/me/twitch/connect", { back }),
  twitchDisconnect: () => api.delete<Envelope<{ connected: boolean }>>("/api/me/twitch"),
  /** where to stream: Twitch's server and your stream key (keep it secret) */
  twitchKey: () => api.get<Envelope<{ server: string; key: string; url: string }>>("/api/me/twitch/key"),
  start: (slug: string, input: { provider: "twitch" | "youtube"; link?: string; title: string; eventId?: string | null }) => api.post<Envelope<LiveDTO>>(`/api/communities/${slug}/live`, input),
  /** the chat beside the stream */
  chat: (slug: string) => api.get<Envelope<{ liveId: string; isMember: boolean; canModerate: boolean; channel: ChannelDTO }>>(`/api/communities/${slug}/live/chat`),
  /** moderating from the live chat: remove someone from the stream (or let them back), or time them out for 10 minutes */
  moderate: (slug: string, userId: string, action: "remove" | "allow" | "timeout") => api.post<Envelope<unknown>>(`/api/communities/${slug}/live/moderate`, { userId, action }),
  end: (slug: string) => api.delete<Envelope<{ ended: boolean }>>(`/api/communities/${slug}/live`),
  /** let a member go live for so many hours (0 takes it back) */
  pass: (slug: string, userId: string, hours: number) => api.post<Envelope<{ userId: string; until: string | null }>>(`/api/communities/${slug}/live/pass`, { userId, hours }),
};

/** The player's address: Twitch's (it must be told which site it's on) or YouTube's. */
export function livePlayerUrl(live: Pick<LiveDTO, "provider" | "channel">, host: string): string {
  return live.provider === "twitch"
    ? `https://player.twitch.tv/?${new URLSearchParams({ channel: live.channel, parent: host, autoplay: "true", muted: "false" })}`
    : `https://www.youtube.com/embed/${encodeURIComponent(live.channel)}?autoplay=1&playsinline=1`;
}
