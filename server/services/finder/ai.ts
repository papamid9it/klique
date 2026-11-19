import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { cityName, regionName } from "@/lib/places";
import { anthropicKey } from "../../env";
import { cityInText, countryCode, plain, regionSlug, trimDescription, wallToUtc, zoneOf, type Candidate } from "./parse";

/**
 * The event finder's AI (Claude): it reads what the normal parser can't (a page with no event markup, a flyer
 * picture an admin drops) and searches the web for upcoming events. Everything it finds only becomes a draft in
 * Admin → Inbox: a person checks it before anyone sees it. Off unless ANTHROPIC_API_KEY is set.
 */

const MODEL = "claude-opus-5-5";

export const aiOn = () => !!anthropicKey();

let client: Anthropic | null = null;
const ai = () => (client ??= new Anthropic({ apiKey: anthropicKey() ?? undefined }));

/** One event, the way the model reports it: times as written on the page (local), places as names. */
const AiEvent = z.object({
  title: z.string(),
  description: z.string(),
  /** local wall-clock time where it happens, "YYYY-MM-DDTHH:mm" */
  starts: z.string(),
  ends: z.string().nullable(),
  venue: z.string(),
  /** city or town name, as written */
  city: z.string(),
  /** state / region name */
  state: z.string(),
  /** ISO country code, e.g. NG */
  country: z.string(),
  online: z.boolean(),
  /** lowest ticket price in major units; 0 free; null not stated */
  price: z.number().nullable(),
  currency: z.string(),
  organizer: z.string(),
  /** a few words for the kind of event (music, comedy, tech, art, food, sports…) */
  kind: z.string(),
  /** the event's own page or ticket page, if known */
  url: z.string().nullable(),
});
type AiEvent = z.infer<typeof AiEvent>;
const Found = z.object({ events: z.array(AiEvent) });

const RULES = `Rules:
- Only real events with a specific date and start time (or a date: then use 00:00). Skip anything already over, recurring "every Friday" with no date, ads, and products.
- Never invent details. Unknown text fields are "", unknown price is null, unknown end is null.
- "starts"/"ends" are local time where the event happens, formatted YYYY-MM-DDTHH:mm. If the year isn't shown, use the next date that is still ahead of today.
- "description": one to three plain sentences in your own words about what it is (not copied marketing text).
- "country": the two-letter ISO code.`;

const today = () => new Date().toISOString().slice(0, 10);

/** The model's event as a finder candidate (times in the place's zone, city and state matched to ours). */
function toCandidate(e: AiEvent, pageUrl: string, siteName: string, fallbackCountry: string, provider: Candidate["provider"]): Candidate | null {
  const country = countryCode(e.country) || fallbackCountry || "NG";
  const tz = zoneOf(country);
  const when = (v: string | null) => {
    const m = v && /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
    return m ? wallToUtc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), 0, tz) : null;
  };
  const startsAt = when(e.starts);
  if (!startsAt || !e.title.trim()) return null;
  const endsAt = when(e.ends);
  const place = cityInText(country, `${e.city}, ${e.state}, ${e.venue}`);
  return {
    provider,
    sourceUrl: e.url && /^https?:\/\//i.test(e.url) ? e.url : pageUrl,
    sourceName: siteName,
    title: e.title.trim().slice(0, 200),
    description: trimDescription(e.description),
    organizerName: e.organizer.trim().slice(0, 120),
    country,
    region: place?.region || regionSlug(country, e.state),
    city: place?.city ?? "",
    venue: e.venue.trim().slice(0, 200),
    placeText: [e.venue, e.city, e.state].filter(Boolean).join(", "),
    online: e.online,
    startsAt,
    endsAt: endsAt && endsAt > startsAt ? endsAt : null,
    timezone: tz,
    price: e.price === null || e.price < 0 ? null : Math.round(e.price),
    currency: (e.currency || "").toUpperCase().slice(0, 3) || (country === "NG" ? "NGN" : "USD"),
    image: null,
    imageReusable: false,
    categoryText: `${e.kind} ${e.title}`,
  };
}

async function parse(content: Anthropic.MessageParam["content"], max = 8000) {
  const res = await ai().messages.parse({
    model: MODEL,
    max_tokens: max,
    output_config: { effort: "low", format: zodOutputFormat(Found) },
    system: `You read event announcements for Klique, an app for going out in Nigerian cities. Today is ${today()}.\n${RULES}`,
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") return [];
  return res.parsed_output?.events ?? [];
}

/**
 * A page the normal parser found no events on: the model reads its text (and its share picture, when it has
 * one) and pulls out the events it announces.
 */
export async function readPageWithAi(page: { url: string; html: string; siteName: string; image: string | null }, fallbackCountry: string): Promise<Candidate[]> {
  const text = plain(page.html).replace(/\s+/g, " ").trim().slice(0, 30_000);
  if (text.length < 40 && !page.image) return [];
  const content: Anthropic.ContentBlockParam[] = [];
  if (page.image && /^https:\/\//i.test(page.image)) content.push({ type: "image", source: { type: "url", url: page.image } });
  content.push({ type: "text", text: `Page: ${page.url}\n\nThe page's text:\n${text}\n\nList the events this page announces.` });
  const events = await parse(content).catch((e) => {
    console.warn("[finder ai] read:", (e as Error).message);
    return [];
  });
  return events.map((e) => toCandidate(e, page.url, page.siteName, fallbackCountry, "page")).filter((c): c is Candidate => !!c);
}

/** A flyer an admin dropped in (already uploaded to our storage), with the post's link and caption if they have them. */
export async function readFlyerWithAi(input: { imageUrl: string; link: string | null; note: string }, fallbackCountry = "NG"): Promise<Candidate[]> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "url", url: input.imageUrl } },
    { type: "text", text: `An event flyer.${input.link ? `\nWhere it was posted: ${input.link}` : ""}${input.note.trim() ? `\nThe caption or note with it:\n${input.note.trim().slice(0, 4000)}` : ""}\n\nList the event(s) it announces.` },
  ];
  const events = await parse(content);
  const site = input.link ? new URL(input.link).hostname.replace(/^www\./, "") : "Flyer";
  return events.map((e) => toCandidate({ ...e, url: null }, input.link ?? input.imageUrl, site, fallbackCountry, "ai")).filter((c): c is Candidate => !!c);
}

/**
 * The agent going out to look: it searches the web for upcoming events in a place and reports each with its
 * page. Social sites are left out (their terms), so it finds ticket pages, venue sites, listings and news.
 */
export async function searchEventsWithAi(q: { country: string; region: string; city: string; interests: string[]; from: Date; to: Date }): Promise<Candidate[]> {
  const country = q.country || "NG";
  const place = q.city ? `${cityName(country, q.city)}, ${regionName(country, q.region || "")}` : q.region ? regionName(country, q.region) : country === "NG" ? "Lagos and Abuja, Nigeria" : country;
  const what = q.interests.length ? ` Focus on: ${q.interests.join(", ")}.` : " Any kind people go out for: music, parties, comedy, art, food, tech, sports, film, markets.";
  const ask = `Find upcoming public events in ${place} between ${q.from.toISOString().slice(0, 10)} and ${q.to.toISOString().slice(0, 10)}.${what}
Search ticket sites (tix.africa, nairabox, eventbrite and similar), venue and organiser websites, and event listings or news. Give each event's own page in "url". Up to 25 events, the most likely to be real and popular first.`;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: ask }];
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(Found) },
    system: `You find events for Klique, an app for going out in Nigerian cities. Today is ${today()}.\n${RULES}\n- Every event must come from a page you found; put that page in "url".`,
    tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6, blocked_domains: ["instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com", "threads.net"], user_location: { type: "approximate" as const, country } }],
  };
  // the server's search loop can pause on a long turn: send it back as it is and it carries on (a few times at most)
  for (let turn = 0; turn < 4; turn++) {
    const res = await ai().messages.parse({ ...params, messages });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") return [];
    return (res.parsed_output?.events ?? []).filter((e) => e.url).map((e) => toCandidate(e, e.url!, new URL(e.url!).hostname.replace(/^www\./, ""), country, "ai")).filter((c): c is Candidate => !!c);
  }
  return [];
}
