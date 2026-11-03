/**
 * AutoMod (community settings → AutoMod): rules that check every chat message, board post and comment, and feed
 * post and comment, before it's saved. Each rule has its own action: block it, alert a mod channel, and/or time
 * the person out. Owners, admins and site admins are never checked; exempt roles and channels can be too. Raid
 * protection watches joins instead.
 */
export interface AutoModAction {
  /** stop the message (the person sees why) */
  block: boolean;
  /** post a note in the alert channel */
  alert: boolean;
  /** time them out for this long (seconds; 0 = no) */
  timeoutSec: number;
}

export interface AutoModConfig {
  enabled: boolean;
  /** where alerts go (a channel id), or none */
  alertChannelId: string | null;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  links: { on: boolean; scamFilter: boolean; blockList: string[]; newMemberMinutes: number; action: AutoModAction };
  words: { on: boolean; list: string[]; action: AutoModAction };
  mentions: { on: boolean; max: number; action: AutoModAction };
  flood: { on: boolean; repeats: number; action: AutoModAction };
  raid: { on: boolean; joins: number; minutes: number; mode: "pause" | "approval"; lockMinutes: number };
}

const act = (block: boolean, alert: boolean, timeoutSec = 0): AutoModAction => ({ block, alert, timeoutSec });

export const DEFAULT_AUTOMOD: AutoModConfig = {
  enabled: false,
  alertChannelId: null,
  exemptRoleIds: [],
  exemptChannelIds: [],
  links: { on: true, scamFilter: true, blockList: [], newMemberMinutes: 0, action: act(true, true) },
  words: { on: false, list: [], action: act(true, false) },
  mentions: { on: true, max: 8, action: act(true, true, 600) },
  flood: { on: true, repeats: 4, action: act(true, false, 300) },
  raid: { on: false, joins: 15, minutes: 5, mode: "approval", lockMinutes: 30 },
};

const int = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const strs = (v: unknown, max: number, len = 60) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().slice(0, len)).filter(Boolean).slice(0, max) : []);
const TIMEOUTS = [0, 60, 300, 600, 3600, 86_400, 604_800];
const action = (v: unknown, d: AutoModAction): AutoModAction => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<AutoModAction>;
  const t = int(o.timeoutSec, 0, 604_800, d.timeoutSec);
  return { block: bool(o.block, d.block), alert: bool(o.alert, d.alert), timeoutSec: TIMEOUTS.includes(t) ? t : d.timeoutSec };
};

/** Stored settings over the defaults, with anything odd dropped. */
export function automodOf(v: unknown): AutoModConfig {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof AutoModConfig, Record<string, unknown>>> & { enabled?: unknown; alertChannelId?: unknown; exemptRoleIds?: unknown; exemptChannelIds?: unknown };
  const d = DEFAULT_AUTOMOD;
  const sec = <K extends "links" | "words" | "mentions" | "flood">(k: K) => (o[k] ?? {}) as Record<string, unknown>;
  const raid = (o.raid ?? {}) as Record<string, unknown>;
  return {
    enabled: bool(o.enabled, d.enabled),
    alertChannelId: typeof o.alertChannelId === "string" && /^[a-f0-9]{24}$/i.test(o.alertChannelId) ? o.alertChannelId : null,
    exemptRoleIds: strs(o.exemptRoleIds, 50, 24).filter((x) => /^[a-f0-9]{24}$/.test(x)),
    exemptChannelIds: strs(o.exemptChannelIds, 100, 24).filter((x) => /^[a-f0-9]{24}$/.test(x)),
    links: { on: bool(sec("links").on, d.links.on), scamFilter: bool(sec("links").scamFilter, d.links.scamFilter), blockList: strs(sec("links").blockList, 200, 100).map((x) => x.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")), newMemberMinutes: int(sec("links").newMemberMinutes, 0, 60 * 24 * 30, d.links.newMemberMinutes), action: action(sec("links").action, d.links.action) },
    words: { on: bool(sec("words").on, d.words.on), list: strs(sec("words").list, 500, 60), action: action(sec("words").action, d.words.action) },
    mentions: { on: bool(sec("mentions").on, d.mentions.on), max: int(sec("mentions").max, 2, 50, d.mentions.max), action: action(sec("mentions").action, d.mentions.action) },
    flood: { on: bool(sec("flood").on, d.flood.on), repeats: int(sec("flood").repeats, 2, 20, d.flood.repeats), action: action(sec("flood").action, d.flood.action) },
    raid: { on: bool(raid.on, d.raid.on), joins: int(raid.joins, 3, 500, d.raid.joins), minutes: int(raid.minutes, 1, 120, d.raid.minutes), mode: raid.mode === "pause" ? "pause" : "approval", lockMinutes: int(raid.lockMinutes, 5, 24 * 60, d.raid.lockMinutes) },
  };
}

/* ------------------------------ matching ------------------------------ */

const LINK = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|ng|net|org|io|xyz|link|ly|me|co|app|info|biz|top|site|online|click|gg|tk|ml|ga|cf|ru|cn|live|shop|store)(?:\/[^\s<>"']*)?/gi;

/** The links in a text, as hostnames ("example.com"). */
export function linksIn(text: string): string[] {
  return (text.match(LINK) ?? []).map((u) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase());
}

/** Well-known scams: "free nitro / crypto / airdrop", "double your money", IP-grabber and look-alike links. */
const SCAM_TEXT = [/\b(free|claim|get)\b.{0,25}\b(nitro|airdrop|crypto|usdt|bitcoin|btc|eth|giveaway|gift ?card)\b/i, /\b(double|triple|multiply)\b.{0,15}\b(your )?(money|crypto|btc|investment)\b/i, /\b(forex|binary|crypto)\b.{0,30}\b(whatsapp|telegram) me\b/i, /\bsend me (your )?(otp|pin|bvn)\b/i];
const SCAM_HOSTS = ["grabify.link", "iplogger.org", "iplogger.com", "2no.co", "yip.su", "bit.do", "discord-nitro", "steamcommunlty", "dlscord", "discorcl"];
export function looksLikeScam(text: string): boolean {
  if (SCAM_TEXT.some((r) => r.test(text))) return true;
  return linksIn(text).some((h) => SCAM_HOSTS.some((s) => h.includes(s)));
}

/** "bad*" → matches "badword"; whole words, any case. */
export function wordRegex(list: string[]): RegExp | null {
  const parts = list.map((w) => w.trim()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? "*" : `\\${c}`)).replace(/\*/g, "\\S*"));
  return parts.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${parts.join("|")})(?![\\p{L}\\p{N}_])`, "iu") : null;
}

/** How many @people a text pings (each handle once; @everyone etc. too). */
export function mentionCount(text: string): number {
  return new Set((text.match(/(?<![\w@])@[\w.]{2,30}/g) ?? []).map((m) => m.toLowerCase())).size;
}
