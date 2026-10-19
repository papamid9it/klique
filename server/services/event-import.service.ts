import "server-only";
import http from "node:http";
import https from "node:https";
import type { Types } from "mongoose";
import { INTEREST_IDS, type InterestId } from "@/lib/constants";
import type { DraftDTO, DraftPatch, ImportResult, SourceDTO } from "@/lib/types";
import { COUNTRIES, currencyOf, getCountry, isCountryCode, regionsOf, slugify } from "@/lib/places";
import { ApiError, badRequest, notFound } from "../http/errors";
import { EventDraft, EventSource, type IEventDraft, type IEventSource } from "../models/EventDraft";
import { Event } from "../models/Event";
import type { IUser } from "../models/User";
import { assertPublicHttpUrl, safeLookup } from "../net-guard";
import { eventCreateSchema } from "../validators/schemas";
import { createEvent } from "./events.service";

/**
 * The event finder. Ticketing and venue sites (Eventbrite, Tix, Meetup, most WordPress event plugins…) publish
 * each event's details as schema.org "Event" data inside the page, for Google. We read that, never the
 * page's layout, so it keeps working when a site is redesigned. A listing page usually links to its events
 * with an ItemList, so we follow those links too.
 *
 * Everything found becomes a pending draft in the admin inbox; nothing is public until an admin approves it.
 * Fetches go through the same SSRF guard as link previews (public hosts only, every redirect re-checked).
 */

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_FOLLOW = 15;

function fetchPage(start: URL, redirects = 0): Promise<{ html: string; url: URL }> {
  return new Promise((resolve, reject) => {
    const mod = start.protocol === "https:" ? https : http;
    const req = mod.request(
      start,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; klique-eventbot/1.0; +https://klique.ng)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error("Too many redirects"));
          try {
            return fetchPage(assertPublicHttpUrl(new URL(res.headers.location, start).toString()), redirects + 1).then(resolve, reject);
          } catch (e) {
            return reject(e);
          }
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`The page answered ${status}`));
        }
        if (!/text\/html|application\/xhtml/i.test(String(res.headers["content-type"] ?? ""))) {
          res.resume();
          return reject(new Error("That link isn't a web page"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) return res.destroy(new Error("The page is too big"));
          chunks.push(c);
        });
        res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), url: start }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("The site took too long to answer")));
    req.on("error", reject);
    req.end();
  });
}

/* ------------------------------ parsing ----------------------------- */

type Json = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const typesOf = (o: Json): string[] => asArray(o["@type"] as string | string[]).map(String);
const isEventType = (t: string) => /Event$|^Festival$/i.test(t) && !/^(Action|Business)Event$/i.test(t);

function decodeEntities(s: string): string {
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
const plain = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();

/** Every JSON-LD object on the page, flattened out of arrays and @graph. */
function jsonLd(html: string): Json[] {
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

const INTEREST_WORDS: [InterestId, RegExp][] = [
  ["skate", /\bskat(e|ing|eboard)/i],
  ["running", /\b(run|running|marathon|5k|10k|jog)/i],
  ["photography", /\b(photo|photography|photowalk|camera)/i],
  ["film", /\b(film|cinema|movie|screening)/i],
  ["dance", /\b(dance|dancing|choreograph|ballet)/i],
  ["streetwear", /\b(streetwear|fashion|thrift|sneaker|pop-?up shop)/i],
  ["art", /\b(art|exhibition|gallery|painting|museum)/i],
  ["music", /\b(music|concert|gig|live|dj|band|afrobeats|amapiano|festival|party)/i],
];
const guessInterest = (text: string): InterestId => INTEREST_WORDS.find(([, rx]) => rx.test(text))?.[0] ?? "music";

function countryCode(v: unknown): string {
  const raw = str(typeof v === "object" && v ? (v as Json).name ?? (v as Json)["@id"] : v);
  if (!raw) return "";
  if (isCountryCode(raw.toUpperCase())) return raw.toUpperCase();
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  return hit?.code ?? "";
}

function regionSlug(country: string, v: unknown): string {
  const name = str(v).toLowerCase().replace(/\s+(state|region|province|county)$/i, "");
  if (!name) return "";
  return regionsOf(country).find((r) => r.name.toLowerCase().replace(/\s+(state|region|province|county)$/i, "") === name || r.slug === slugify(name))?.slug ?? "";
}

type DraftFields = Omit<IEventDraft, "_id" | "status" | "eventId" | "reviewedBy" | "createdAt" | "updatedAt">;

function toDraft(o: Json, pageUrl: URL, siteName: string): DraftFields | null {
  const title = decodeEntities(str(o.name));
  const startsAt = str(o.startDate) ? new Date(str(o.startDate)) : null;
  if (!title || !startsAt || Number.isNaN(startsAt.getTime())) return null;
  const endsAt = str(o.endDate) ? new Date(str(o.endDate)) : null;

  const locations = asArray(o.location as Json | Json[]);
  const place = locations.find((l) => l && typeof l === "object" && !typesOf(l).includes("VirtualLocation")) as Json | undefined;
  const virtual = locations.find((l) => l && typeof l === "object" && typesOf(l).includes("VirtualLocation")) as Json | undefined;
  const online = !place && (!!virtual || /Online/i.test(str(o.eventAttendanceMode)));
  const address = (place?.address && typeof place.address === "object" ? place.address : {}) as Json;
  const country = countryCode(address.addressCountry) || "NG";
  const city = slugify(str(address.addressLocality) || (typeof place?.address === "string" ? String(place.address).split(",").slice(-2, -1)[0] ?? "" : ""));

  const offers = asArray(o.offers as Json | Json[]).filter((x) => x && typeof x === "object");
  const prices = offers.map((x) => Number(str(x.price) || str(x.lowPrice))).filter((n) => Number.isFinite(n) && n >= 0);
  const currency = str(offers[0]?.priceCurrency).toUpperCase() || currencyOf(country);

  const image = asArray(o.image as unknown).map((i) => (typeof i === "string" ? i : str((i as Json)?.url)))[0] ?? "";
  const organizer = asArray(o.organizer as Json | Json[])[0];
  const description = plain(str(o.description)).slice(0, 4000);
  let url = pageUrl.toString();
  try {
    if (str(o.url)) url = new URL(str(o.url), pageUrl).toString();
  } catch {
    /* keep the page's own address */
  }

  return {
    sourceUrl: url.slice(0, 1000),
    sourceName: siteName,
    title: title.slice(0, 200),
    description,
    interest: guessInterest(`${title} ${description}`),
    organizerName: decodeEntities(str(organizer && typeof organizer === "object" ? organizer.name : organizer)).slice(0, 120),
    country,
    region: regionSlug(country, address.addressRegion),
    city,
    venue: (online ? str(virtual?.url) || "Online" : decodeEntities(str(place?.name)) || str(address.streetAddress)).slice(0, 200),
    online,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    price: prices.length ? Math.round(Math.min(...prices)) : 0,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : currencyOf(country),
    coverImage: /^https?:\/\//.test(image) ? image.slice(0, 1000) : null,
  };
}

const siteNameOf = (html: string, url: URL) => decodeEntities(html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ?? url.hostname.replace(/^www\./, "")).slice(0, 120);

/** Events on one page, plus the event pages a listing links to (ItemList). */
async function findEvents(rawUrl: string): Promise<DraftFields[]> {
  let start: URL;
  try {
    start = assertPublicHttpUrl(rawUrl);
  } catch {
    throw badRequest("Enter a full public link, starting with https://");
  }
  const { html, url } = await fetchPage(start);
  const site = siteNameOf(html, url);
  const objects = jsonLd(html);
  const found = objects.filter((o) => typesOf(o).some(isEventType)).map((o) => toDraft(o, url, site)).filter((d): d is DraftFields => !!d);

  // A listing page: follow its ItemList links (only when the page itself had no full events).
  if (!found.length) {
    const links = objects
      .filter((o) => typesOf(o).includes("ItemList"))
      .flatMap((o) => asArray(o.itemListElement as Json | Json[]))
      .map((it) => str(it?.url) || str((it?.item as Json | undefined)?.url) || str(it?.item))
      .filter(Boolean);
    for (const link of [...new Set(links)].slice(0, MAX_FOLLOW)) {
      try {
        const page = await fetchPage(assertPublicHttpUrl(new URL(link, url).toString()));
        const s = siteNameOf(page.html, page.url);
        for (const o of jsonLd(page.html).filter((x) => typesOf(x).some(isEventType))) {
          const d = toDraft(o, page.url, s);
          if (d) found.push(d);
        }
      } catch {
        /* one dead link shouldn't stop the rest */
      }
    }
  }
  return found;
}

/* ------------------------------ service ----------------------------- */

/** Find events at a link and add the new, upcoming ones to the inbox as pending drafts. */
export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  let found: DraftFields[];
  try {
    found = await findEvents(rawUrl);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest(`Couldn't read that page: ${(e as Error).message}.`);
  }
  const now = Date.now();
  const result: ImportResult = { found: found.length, added: 0, skipped: 0, past: 0 };
  for (const d of found) {
    if (d.startsAt && +d.startsAt < now) {
      result.past++;
      continue;
    }
    const res = await EventDraft.updateOne({ sourceUrl: d.sourceUrl }, { $setOnInsert: { ...d, status: "pending" } }, { upsert: true });
    if (res.upsertedCount) result.added++;
    else result.skipped++;
  }
  return result;
}

const toDto = (d: IEventDraft): DraftDTO => ({
  id: String(d._id),
  status: d.status,
  sourceUrl: d.sourceUrl,
  sourceName: d.sourceName,
  title: d.title,
  description: d.description,
  interest: d.interest,
  organizerName: d.organizerName,
  country: d.country,
  region: d.region,
  city: d.city,
  venue: d.venue,
  online: d.online,
  startsAt: d.startsAt ? d.startsAt.toISOString() : null,
  endsAt: d.endsAt ? d.endsAt.toISOString() : null,
  price: d.price,
  currency: d.currency,
  coverImage: d.coverImage,
  eventId: d.eventId ? String(d.eventId) : null,
  createdAt: d.createdAt.toISOString(),
});

export async function listDrafts(status: IEventDraft["status"]): Promise<DraftDTO[]> {
  const rows = await EventDraft.find({ status })
    .sort(status === "pending" ? { startsAt: 1 } : { updatedAt: -1 })
    .limit(200)
    .lean<IEventDraft[]>();
  return rows.map(toDto);
}

function cleanPatch(p: DraftPatch): Partial<IEventDraft> {
  const set: Partial<IEventDraft> = {};
  if (p.title !== undefined) set.title = p.title.trim().slice(0, 200);
  if (p.description !== undefined) set.description = p.description.slice(0, 4000);
  if (p.interest !== undefined && INTEREST_IDS.includes(p.interest)) set.interest = p.interest;
  if (p.organizerName !== undefined) set.organizerName = p.organizerName.trim().slice(0, 120);
  if (p.country !== undefined && getCountry(p.country)) set.country = p.country.toUpperCase();
  if (p.region !== undefined) set.region = p.region;
  if (p.city !== undefined) set.city = slugify(p.city);
  if (p.venue !== undefined) set.venue = p.venue.trim().slice(0, 200);
  if (p.online !== undefined) set.online = !!p.online;
  if (p.startsAt !== undefined) set.startsAt = p.startsAt ? new Date(p.startsAt) : null;
  if (p.endsAt !== undefined) set.endsAt = p.endsAt ? new Date(p.endsAt) : null;
  if (p.price !== undefined && Number.isFinite(p.price) && p.price >= 0) set.price = Math.round(p.price);
  if (p.currency !== undefined && /^[A-Z]{3}$/.test(p.currency.toUpperCase())) set.currency = p.currency.toUpperCase();
  if (p.coverImage !== undefined) set.coverImage = p.coverImage || null;
  return set;
}

export async function updateDraft(id: string, patch: DraftPatch): Promise<DraftDTO> {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { $set: cleanPatch(patch) }, { new: true }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  return toDto(d);
}

/** Publish a draft as a real public event, hosted by the approving admin and credited to its organiser. */
export async function approveDraft(admin: IUser, id: string, patch: DraftPatch = {}): Promise<{ eventId: string; title: string }> {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { $set: cleanPatch(patch) }, { new: true }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  const input = eventCreateSchema.parse({
    title: d.title,
    description: d.description,
    interest: d.interest,
    country: d.country,
    region: d.region || undefined,
    city: d.city,
    venue: d.venue,
    online: d.online,
    startsAt: d.startsAt?.toISOString(),
    endsAt: d.endsAt ? d.endsAt.toISOString() : null,
    priceNaira: d.price,
    currency: d.currency,
    coverImage: d.coverImage || null,
  });
  const ev = await createEvent(admin, input);
  await Event.updateOne({ _id: ev.id }, { organizerName: d.organizerName || d.sourceName || null, sourceUrl: d.sourceUrl });
  await EventDraft.updateOne({ _id: d._id }, { status: "approved", eventId: ev.id as unknown as Types.ObjectId, reviewedBy: admin._id });
  return { eventId: ev.id, title: ev.title };
}

export async function rejectDraft(admin: IUser, id: string) {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { status: "rejected", reviewedBy: admin._id }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  return { rejected: true, title: d.title };
}

/* ------------------------------ sources ----------------------------- */

const sourceDto = (s: IEventSource): SourceDTO => ({ id: String(s._id), url: s.url, name: s.name, lastRunAt: s.lastRunAt?.toISOString() ?? null, lastFound: s.lastFound, lastError: s.lastError });

export async function listSources(): Promise<SourceDTO[]> {
  return (await EventSource.find().sort({ createdAt: 1 }).lean<IEventSource[]>()).map(sourceDto);
}

export async function addSource(url: string, name: string): Promise<SourceDTO> {
  let u: URL;
  try {
    u = assertPublicHttpUrl(url);
  } catch {
    throw badRequest("Enter a full public link, starting with https://");
  }
  const s = await EventSource.findOneAndUpdate({ url: u.toString() }, { $setOnInsert: { url: u.toString(), name: name.trim().slice(0, 120) || u.hostname.replace(/^www\./, "") } }, { upsert: true, new: true }).lean<IEventSource>();
  return sourceDto(s!);
}

export async function removeSource(id: string): Promise<SourceDTO | null> {
  const s = await EventSource.findOneAndDelete({ _id: id }).lean<IEventSource>();
  return s ? sourceDto(s) : null;
}

/** Check every source page (the nightly run, or "Check now" in the admin page). */
export async function runSources(): Promise<{ sources: number; added: number }> {
  const sources = await EventSource.find().lean<IEventSource[]>();
  let added = 0;
  for (const s of sources) {
    try {
      const r = await importFromUrl(s.url);
      added += r.added;
      await EventSource.updateOne({ _id: s._id }, { lastRunAt: new Date(), lastFound: r.found, lastError: "" });
    } catch (e) {
      await EventSource.updateOne({ _id: s._id }, { lastRunAt: new Date(), lastError: (e as Error).message.slice(0, 300) });
    }
  }
  return { sources: sources.length, added };
}
