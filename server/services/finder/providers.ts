import "server-only";
import { currencyOf, slugify } from "@/lib/places";
import { eventbriteToken, ticketmasterKey } from "../../env";
import { politeFetch } from "./http";
import { cityInText, countryCode, parseWhen, plain, str, trimDescription, zoneOf, type Candidate } from "./parse";

/**
 * Official event APIs. Their terms let us show the event's own picture alongside the event (with the link
 * back), so their images are marked reusable; scraped pages' images are not.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

export interface Search {
  country: string;
  region: string;
  city: string;
  from: Date;
  to: Date;
}

/* -------------------------------- Ticketmaster -------------------------------- */

const tmTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Ticketmaster Discovery API: events in a city and date range (one page of up to 100, soonest first). */
export async function ticketmaster(search: Search, cityName: string): Promise<Candidate[]> {
  const key = ticketmasterKey();
  if (!key) return [];
  const q = new URLSearchParams({ apikey: key, countryCode: search.country, startDateTime: tmTime(search.from), endDateTime: tmTime(search.to), size: "100", sort: "date,asc", locale: "*" });
  if (cityName) q.set("city", cityName);
  const r = await politeFetch(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, { api: true, accept: "application/json", fresh: false });
  const data = JSON.parse(r.body) as Json;
  return arr(obj(data._embedded).events)
    .map((e): Candidate | null => {
      const venue = arr(obj(e._embedded).venues)[0] ?? {};
      const country = countryCode(str(obj(venue.country).countryCode)) || search.country;
      const tz = str(obj(e.dates).timezone) || zoneOf(country);
      const start = obj(obj(e.dates).start);
      const startsAt = str(start.dateTime) ? parseWhen(str(start.dateTime), tz) : parseWhen(`${str(start.localDate)}T${str(start.localTime) || "00:00:00"}`, tz);
      if (!startsAt || !str(e.name) || !str(e.url)) return null;
      const end = obj(obj(e.dates).end);
      const endsAt = str(end.dateTime) ? parseWhen(str(end.dateTime), tz) : null;
      const image = arr(e.images).filter((i) => str(i.ratio) === "16_9").sort((a, b) => Number(b.width) - Number(a.width))[0] ?? arr(e.images)[0];
      const price = arr(e.priceRanges)[0];
      const cls = arr(e.classifications)[0] ?? {};
      const placeText = [str(venue.name), str(obj(venue.address).line1), str(obj(venue.city).name)].filter(Boolean).join(", ");
      const cityText = str(obj(venue.city).name);
      const found = cityInText(country, placeText);
      return {
        provider: "ticketmaster",
        sourceUrl: str(e.url).slice(0, 1000),
        sourceName: "Ticketmaster",
        title: str(e.name).slice(0, 200),
        description: trimDescription(plain(str(e.info) || str(e.pleaseNote) || str(e.description))),
        organizerName: str(obj(e.promoter).name).slice(0, 120),
        country,
        region: found?.region ?? "",
        city: found?.city ?? slugify(cityText),
        venue: str(venue.name).slice(0, 200),
        placeText,
        online: false,
        startsAt,
        endsAt: endsAt && endsAt > startsAt ? endsAt : null,
        timezone: tz,
        price: price ? Math.round(Number(price.min) || 0) : 0,
        currency: str(price?.currency).toUpperCase() || currencyOf(country),
        image: str(image?.url) || null,
        imageReusable: true,
        categoryText: `${str(e.name)} ${str(obj(cls.segment).name)} ${str(obj(cls.genre).name)} ${str(obj(cls.subGenre).name)}`,
      };
    })
    .filter((c): c is Candidate => !!c);
}

/* --------------------------------- Eventbrite --------------------------------- */

/** "https://www.eventbrite.com/o/some-name-1234567890" or "eventbrite:org:1234567890" → the organiser id. */
export function eventbriteOrgId(input: string): string | null {
  const m = /^eventbrite:org:(\d{5,})$/i.exec(input.trim()) ?? /eventbrite\.[a-z.]+\/o\/[^/?#]*?-?(\d{6,})(?:[/?#]|$)/i.exec(input.trim());
  return m?.[1] ?? null;
}

/** An organiser's live upcoming events from Eventbrite's API (a public city search no longer exists). */
export async function eventbriteOrganizer(orgId: string, fallbackCountry: string): Promise<Candidate[]> {
  const token = eventbriteToken();
  if (!token) return [];
  const url = `https://www.eventbriteapi.com/v3/organizers/${orgId}/events/?status=live&order_by=start_asc&expand=venue,ticket_availability,logo,organizer&page_size=50`;
  const r = await politeFetch(url, { api: true, accept: "application/json", headers: { Authorization: `Bearer ${token}` } });
  const data = JSON.parse(r.body) as Json;
  return arr(data.events)
    .map((e): Candidate | null => {
      const venue = obj(e.venue);
      const address = obj(venue.address);
      const country = countryCode(str(address.country)) || fallbackCountry;
      const tz = str(obj(e.start).timezone) || zoneOf(country);
      const startsAt = parseWhen(str(obj(e.start).utc), tz);
      if (!startsAt || !str(obj(e.name).text) || !str(e.url)) return null;
      const endsAt = parseWhen(str(obj(e.end).utc), tz);
      const placeText = [str(venue.name), str(address.localized_address_display), str(address.city)].filter(Boolean).join(", ");
      const found = cityInText(country, placeText);
      const min = obj(obj(e.ticket_availability).minimum_ticket_price);
      return {
        provider: "eventbrite",
        sourceUrl: str(e.url).slice(0, 1000),
        sourceName: "Eventbrite",
        title: str(obj(e.name).text).slice(0, 200),
        description: trimDescription(str(obj(e.description).text) || str(e.summary)),
        organizerName: str(obj(e.organizer).name).slice(0, 120),
        country,
        region: found?.region ?? "",
        city: found?.city ?? slugify(str(address.city)),
        venue: (e.online_event ? "Online" : str(venue.name)).slice(0, 200),
        placeText,
        online: !!e.online_event,
        startsAt,
        endsAt: endsAt && endsAt > startsAt ? endsAt : null,
        timezone: tz,
        price: e.is_free ? 0 : Math.round(Number(min.major_value) || 0),
        currency: str(min.currency).toUpperCase() || currencyOf(country),
        image: str(obj(obj(e.logo).original).url) || str(obj(e.logo).url) || null,
        imageReusable: true,
        categoryText: `${str(obj(e.name).text)} ${str(e.summary)}`,
      };
    })
    .filter((c): c is Candidate => !!c);
}
