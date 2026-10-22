import "server-only";
import { CITIES, COUNTRIES, currencyOf, isCountryCode, regionsOf, slugify } from "@/lib/places";

/**
 * Turning what other sites publish into event candidates. We read the structured data sites publish for
 * search engines and calendars (schema.org Event as JSON-LD or microdata, iCalendar, RSS/Atom), never a
 * page's layout, so it keeps working when a site is redesigned.
 */

export type Provider = "page" | "ical" | "rss" | "ticketmaster" | "eventbrite";

export interface Candidate {
  provider: Provider;
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  organizerName: string;
  country: string;
  region: string;
  city: string;
  venue: string;
  /** free text about the place (address, area), used to match a city when there's no structured one */
  placeText: string;
  online: boolean;
  startsAt: Date;
  endsAt: Date | null;
  /** the IANA zone the times were given in (shown to the reviewer) */
  timezone: string;
  price: number;
  currency: string;
  /** the source's picture */
  image: string | null;
  /** the source's terms let us show that picture (official APIs); otherwise the admin uploads one */
  imageReusable: boolean;
  /** words to guess the category from (the source's own category plus the title) */
  categoryText: string;
}

/* ------------------------------ text helpers ------------------------------ */

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
export const plain = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** A description trimmed to a readable length at a sentence or word boundary. */
export function trimDescription(s: string, max = 1200): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim() + "…";
}

type Json = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const typesOf = (o: Json): string[] => asArray(o["@type"] as string | string[]).map(String);
const isEventType = (t: string) => /Event$|^Festival$/i.test(t) && !/^(Action|Business)Event$/i.test(t);

/* -------------------------------- time zones -------------------------------- */

const ZONES: Record<string, string> = {
  NG: "Africa/Lagos", GH: "Africa/Accra", KE: "Africa/Nairobi", ZA: "Africa/Johannesburg", EG: "Africa/Cairo", MA: "Africa/Casablanca", SN: "Africa/Dakar",
  CI: "Africa/Abidjan", RW: "Africa/Kigali", UG: "Africa/Kampala", TZ: "Africa/Dar_es_Salaam", ET: "Africa/Addis_Ababa", CM: "Africa/Douala", BJ: "Africa/Porto-Novo",
  GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", DE: "Europe/Berlin", NL: "Europe/Amsterdam", ES: "Europe/Madrid", IT: "Europe/Rome", PT: "Europe/Lisbon",
  US: "America/New_York", CA: "America/Toronto", BR: "America/Sao_Paulo", AE: "Asia/Dubai", IN: "Asia/Kolkata", AU: "Australia/Sydney",
};
export const zoneOf = (country: string) => ZONES[country] ?? "UTC";

function offsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime();
}

/** A wall-clock time in a zone ("29 Oct 16:00 in Lagos") as the real instant. */
export function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t;
  try {
    t = guess - offsetMs(tz, new Date(guess));
    t = guess - offsetMs(tz, new Date(t)); // second pass settles daylight-saving edges
  } catch {
    t = guess; // unknown zone: treat as UTC
  }
  return new Date(t);
}

/** An ISO-ish date from a page: with an offset it's exact; without one it's local time in `tz`. */
export function parseWhen(raw: string, tz: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return wallToUtc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
}

/* ---------------------------------- places ---------------------------------- */

export function countryCode(v: unknown): string {
  const raw = str(typeof v === "object" && v ? ((v as Json).name ?? (v as Json)["@id"]) : v);
  if (!raw) return "";
  if (isCountryCode(raw.toUpperCase())) return raw.toUpperCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.code ?? "";
}

export function regionSlug(country: string, v: unknown): string {
  const name = str(v).toLowerCase().replace(/\s+(state|region|province|county)$/i, "");
  if (!name) return "";
  return regionsOf(country).find((r) => r.name.toLowerCase().replace(/\s+(state|region|province|county)$/i, "") === name || r.slug === slugify(name))?.slug ?? "";
}

/** A known city named somewhere in free text ("Freedom Park, Lagos Island, Lagos"), for a country. */
export function cityInText(country: string, text: string): { city: string; region: string } | null {
  const t = ` ${text.toLowerCase()} `;
  const hit = CITIES.filter((c) => c.country === country)
    .sort((a, b) => b.name.length - a.name.length)
    .find((c) => new RegExp(`[^a-z]${c.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z]`).test(t));
  return hit ? { city: hit.slug, region: hit.region ?? "" } : null;
}

/* ------------------------------ schema.org Event ------------------------------ */

/** Every JSON-LD object on the page, flattened out of arrays and @graph. */
export function jsonLd(html: string): Json[] {
  const out: Json[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Json;
      out.push(o);
      if (o["@graph"]) walk(o["@graph"]);
    }
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* one broken block shouldn't hide the others */
    }
  }
  return out;
}

/**
 * schema.org microdata (itemscope itemtype=".../Event" with itemprop children), turned into the same shape as
 * JSON-LD. Good enough for the flat markup event plugins print; nested items (location, offers) are read
 * from their own itemscope blocks.
 */
export function microdata(html: string): Json[] {
  const out: Json[] = [];
  const re = /<([a-z0-9]+)[^>]*itemscope[^>]*itemtype=["']https?:\/\/schema\.org\/(\w*Event|Festival)["'][^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const start = m.index ?? 0;
    // the event's block runs to the next event (or a sensible length)
    const next = html.slice(start + m[0].length).search(re);
    const block = html.slice(start, next >= 0 ? start + m[0].length + next : start + 20_000);
    const prop = (name: string, scope = block): string => {
      const pm = new RegExp(`<([a-z0-9]+)[^>]*itemprop=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>`, "i").exec(scope);
      if (!pm) return "";
      const tag = pm[0];
      const attr = /\b(content|datetime|href|src)=["']([^"']*)["']/i.exec(tag)?.[2];
      if (attr) return decodeEntities(attr);
      const rest = scope.slice((pm.index ?? 0) + tag.length);
      const close = rest.search(new RegExp(`</${pm[1]}>`, "i"));
      return plain(close >= 0 ? rest.slice(0, close) : rest.slice(0, 300));
    };
    const scoped = (type: RegExp): string => {
      const sm = new RegExp(`<[^>]*itemscope[^>]*itemtype=["']https?://schema\\.org/(${type.source})["'][^>]*>`, "i").exec(block);
      return sm ? block.slice(sm.index ?? 0, (sm.index ?? 0) + 4000) : "";
    };
    const place = scoped(/Place|EventVenue|MusicVenue/);
    const address = scoped(/PostalAddress/);
    const offer = scoped(/Offer|AggregateOffer/);
    out.push({
      "@type": m[2],
      name: prop("name"),
      startDate: prop("startDate"),
      endDate: prop("endDate"),
      description: prop("description"),
      url: prop("url"),
      image: prop("image"),
      location: place || address ? { "@type": "Place", name: place ? prop("name", place) : "", address: { streetAddress: prop("streetAddress", address), addressLocality: prop("addressLocality", address), addressRegion: prop("addressRegion", address), addressCountry: prop("addressCountry", address) } } : undefined,
      offers: offer ? { price: prop("price", offer) || prop("lowPrice", offer), priceCurrency: prop("priceCurrency", offer) } : undefined,
      organizer: prop("organizer"),
    });
  }
  return out;
}

export const isEvent = (o: Json) => typesOf(o).some(isEventType);

/** ItemList links on a listings page (the event pages it points to). */
export function itemListLinks(objects: Json[]): string[] {
  return objects
    .filter((o) => typesOf(o).includes("ItemList"))
    .flatMap((o) => asArray(o.itemListElement as Json | Json[]))
    .map((it) => str(it?.url) || str((it?.item as Json | undefined)?.url) || str(it?.item))
    .filter(Boolean);
}

export function fromSchemaOrg(o: Json, pageUrl: URL, siteName: string, fallbackCountry: string): Candidate | null {
  const title = decodeEntities(str(o.name));
  if (!title) return null;
  const locations = asArray(o.location as Json | Json[]);
  const place = locations.find((l) => l && typeof l === "object" && !typesOf(l).includes("VirtualLocation")) as Json | undefined;
  const placeString = locations.find((l) => typeof l === "string") as string | undefined;
  const virtual = locations.find((l) => l && typeof l === "object" && typesOf(l).includes("VirtualLocation")) as Json | undefined;
  const online = !place && !placeString && (!!virtual || /Online/i.test(str(o.eventAttendanceMode)));
  const address = (place?.address && typeof place.address === "object" ? place.address : {}) as Json;
  const addressText = typeof place?.address === "string" ? String(place.address) : [address.streetAddress, address.addressLocality, address.addressRegion].map(str).filter(Boolean).join(", ");
  const country = countryCode(address.addressCountry) || fallbackCountry;
  const tz = zoneOf(country);
  const startsAt = parseWhen(str(o.startDate), tz);
  if (!startsAt) return null;
  const endsAt = parseWhen(str(o.endDate), tz);

  const placeText = [decodeEntities(str(place?.name)), addressText, placeString ?? ""].filter(Boolean).join(", ");
  let city = slugify(str(address.addressLocality));
  let region = regionSlug(country, address.addressRegion);
  if (!city) {
    const found = cityInText(country, placeText);
    if (found) ({ city, region } = { city: found.city, region: region || found.region });
  }

  const offers = asArray(o.offers as Json | Json[]).filter((x) => x && typeof x === "object");
  const prices = offers.map((x) => Number(str(x.price) || str(x.lowPrice))).filter((n) => Number.isFinite(n) && n >= 0);
  const currency = str(offers[0]?.priceCurrency).toUpperCase() || currencyOf(country);
  const image = asArray(o.image as unknown).map((i) => (typeof i === "string" ? i : str((i as Json)?.url)))[0] ?? "";
  const organizer = asArray(o.organizer as Json | Json[])[0];
  let url = pageUrl.toString();
  try {
    if (str(o.url)) url = new URL(str(o.url), pageUrl).toString();
  } catch {
    /* keep the page's own address */
  }
  const description = trimDescription(plain(str(o.description)));
  return {
    provider: "page",
    sourceUrl: url.slice(0, 1000),
    sourceName: siteName,
    title: title.slice(0, 200),
    description,
    organizerName: decodeEntities(str(organizer && typeof organizer === "object" ? (organizer as Json).name : organizer)).slice(0, 120),
    country,
    region,
    city,
    venue: (online ? str(virtual?.url) || "Online" : decodeEntities(str(place?.name)) || str(address.streetAddress) || placeString || "").slice(0, 200),
    placeText,
    online,
    startsAt,
    endsAt: endsAt && endsAt > startsAt ? endsAt : null,
    timezone: tz,
    price: prices.length ? Math.round(Math.min(...prices)) : 0,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : currencyOf(country),
    image: /^https?:\/\//.test(image) ? image.slice(0, 1000) : null,
    imageReusable: false,
    // the schema.org type says a lot ("ComedyEvent", "MusicEvent", "SportsEvent")
    categoryText: `${title} ${typesOf(o).map((t) => t.replace(/Event$/, "").replace(/([a-z])([A-Z])/g, "$1 $2")).join(" ")} ${asArray(o.keywords as string | string[]).join(" ")} ${str((o as Json).genre)} ${description.slice(0, 300)}`,
  };
}

export const siteNameOf = (html: string, url: URL) => decodeEntities(html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ?? url.hostname.replace(/^www\./, "")).slice(0, 120);

/* --------------------------------- iCalendar --------------------------------- */

const icsText = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

function icsWhen(value: string, params: string, fallbackTz: string): Date | null {
  const tz = /TZID=([^;:]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, "") ?? fallbackTz;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  return wallToUtc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
}

/** Events in an iCalendar feed (VEVENTs; repeating rules are not expanded: the first date is used). */
export function fromIcs(body: string, feedUrl: URL, country: string): Candidate[] {
  const lines = body.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const calName = icsText(lines.find((l) => l.startsWith("X-WR-CALNAME:"))?.slice(13) ?? "") || feedUrl.hostname.replace(/^www\./, "");
  const calTz = lines.find((l) => l.startsWith("X-WR-TIMEZONE:"))?.slice(14).trim() || zoneOf(country);
  const out: Candidate[] = [];
  let ev: Record<string, { v: string; p: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") ev = {};
    else if (line === "END:VEVENT" && ev) {
      const get = (k: string) => ev?.[k];
      const title = icsText(get("SUMMARY")?.v ?? "");
      const start = get("DTSTART") ? icsWhen(get("DTSTART")!.v, get("DTSTART")!.p, calTz) : null;
      if (title && start && !/CANCELLED/i.test(get("STATUS")?.v ?? "")) {
        const end = get("DTEND") ? icsWhen(get("DTEND")!.v, get("DTEND")!.p, calTz) : null;
        const location = icsText(get("LOCATION")?.v ?? "");
        const found = cityInText(country, location);
        const description = trimDescription(icsText(get("DESCRIPTION")?.v ?? ""));
        let url = get("URL")?.v.trim() ?? "";
        if (!/^https?:\/\//.test(url)) url = `${feedUrl.toString()}#${encodeURIComponent(get("UID")?.v ?? title)}`;
        out.push({
          provider: "ical",
          sourceUrl: url.slice(0, 1000),
          sourceName: calName.slice(0, 120),
          title: title.slice(0, 200),
          description,
          organizerName: icsText((get("ORGANIZER")?.p.match(/CN=([^;:]+)/i)?.[1] ?? "").replace(/^"|"$/g, "")).slice(0, 120),
          country,
          region: found?.region ?? "",
          city: found?.city ?? "",
          venue: location.split(",")[0]?.slice(0, 200) ?? "",
          placeText: location,
          online: /^(online|zoom|virtual)/i.test(location),
          startsAt: start,
          endsAt: end && end > start ? end : null,
          timezone: calTz,
          price: 0,
          currency: currencyOf(country),
          image: null,
          imageReusable: false,
          categoryText: `${title} ${icsText(get("CATEGORIES")?.v ?? "")} ${description.slice(0, 300)}`,
        });
      }
      ev = null;
    } else if (ev) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m && !ev[m[1]]) ev[m[1]] = { p: m[2], v: m[3] };
    }
  }
  return out;
}

/* ------------------------------------ RSS ------------------------------------ */

/** The item links in an RSS or Atom feed (each is then read as an event page). */
export function feedLinks(xml: string, base: URL): string[] {
  const links = [
    ...[...xml.matchAll(/<item\b[\s\S]*?<link>([\s\S]*?)<\/link>/gi)].map((m) => m[1]),
    ...[...xml.matchAll(/<entry\b[\s\S]*?<link[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  return [...new Set(links.map((l) => decodeEntities(l.replace(/<!\[CDATA\[|\]\]>/g, "").trim())).filter(Boolean).map((l) => { try { return new URL(l, base).toString(); } catch { return ""; } }).filter(Boolean))];
}

export const looksLikeIcs = (type: string, body: string) => /text\/calendar/i.test(type) || /^\s*BEGIN:VCALENDAR/.test(body);
export const looksLikeFeed = (type: string, body: string) => /(rss|atom)\+xml|text\/xml|application\/xml/i.test(type) && /<(rss|feed)\b/i.test(body.slice(0, 2000));
