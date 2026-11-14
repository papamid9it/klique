/**
 * Time zones for places. Every event and klique keeps its place's zone (IANA, e.g. "America/New_York"): the host
 * types times in it and everyone sees them in it. Anything saved before zones existed is Lagos (DEFAULT_ZONE).
 * Built in, no lookups: a country's zones (the first is its usual one), a few big cities in countries with more
 * than one, and the host's own device zone when it's one of that country's.
 */

export const DEFAULT_ZONE = "Africa/Lagos";

const ZONES: Record<string, string[]> = {
  DZ: ["Africa/Algiers"], AO: ["Africa/Luanda"], BJ: ["Africa/Porto-Novo"], BW: ["Africa/Gaborone"], BF: ["Africa/Ouagadougou"], BI: ["Africa/Bujumbura"],
  CV: ["Atlantic/Cape_Verde"], CM: ["Africa/Douala"], CF: ["Africa/Bangui"], TD: ["Africa/Ndjamena"], KM: ["Indian/Comoro"], CG: ["Africa/Brazzaville"],
  CD: ["Africa/Kinshasa", "Africa/Lubumbashi"], CI: ["Africa/Abidjan"], DJ: ["Africa/Djibouti"], EG: ["Africa/Cairo"], GQ: ["Africa/Malabo"], ER: ["Africa/Asmara"],
  SZ: ["Africa/Mbabane"], ET: ["Africa/Addis_Ababa"], GA: ["Africa/Libreville"], GM: ["Africa/Banjul"], GH: ["Africa/Accra"], GN: ["Africa/Conakry"],
  GW: ["Africa/Bissau"], KE: ["Africa/Nairobi"], LS: ["Africa/Maseru"], LR: ["Africa/Monrovia"], LY: ["Africa/Tripoli"], MG: ["Indian/Antananarivo"],
  MW: ["Africa/Blantyre"], ML: ["Africa/Bamako"], MR: ["Africa/Nouakchott"], MU: ["Indian/Mauritius"], MA: ["Africa/Casablanca"], MZ: ["Africa/Maputo"],
  NA: ["Africa/Windhoek"], NE: ["Africa/Niamey"], NG: ["Africa/Lagos"], RW: ["Africa/Kigali"], ST: ["Africa/Sao_Tome"], SN: ["Africa/Dakar"],
  SC: ["Indian/Mahe"], SL: ["Africa/Freetown"], SO: ["Africa/Mogadishu"], ZA: ["Africa/Johannesburg"], SS: ["Africa/Juba"], SD: ["Africa/Khartoum"],
  TZ: ["Africa/Dar_es_Salaam"], TG: ["Africa/Lome"], TN: ["Africa/Tunis"], UG: ["Africa/Kampala"], ZM: ["Africa/Lusaka"], ZW: ["Africa/Harare"],
  GB: ["Europe/London"], IE: ["Europe/Dublin"], FR: ["Europe/Paris"], DE: ["Europe/Berlin"], ES: ["Europe/Madrid", "Atlantic/Canary"], PT: ["Europe/Lisbon", "Atlantic/Azores"],
  IT: ["Europe/Rome"], NL: ["Europe/Amsterdam"], BE: ["Europe/Brussels"], SE: ["Europe/Stockholm"], CH: ["Europe/Zurich"],
  US: ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"],
  CA: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Regina", "America/Halifax", "America/St_Johns"],
  MX: ["America/Mexico_City", "America/Cancun", "America/Chihuahua", "America/Hermosillo", "America/Tijuana"],
  JM: ["America/Jamaica"], TT: ["America/Port_of_Spain"],
  BR: ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife", "America/Belem", "America/Cuiaba", "America/Rio_Branco"],
  AR: ["America/Argentina/Buenos_Aires"], CO: ["America/Bogota"], AE: ["Asia/Dubai"], SA: ["Asia/Riyadh"], TR: ["Europe/Istanbul"], IN: ["Asia/Kolkata"],
  CN: ["Asia/Shanghai"], JP: ["Asia/Tokyo"], KR: ["Asia/Seoul"], SG: ["Asia/Singapore"], ID: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"], PH: ["Asia/Manila"],
  AU: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Australia/Darwin", "Australia/Hobart"],
  NZ: ["Pacific/Auckland"],
};

/** Big cities in countries with more than one zone (city slugs, as lib/places makes them). */
const CITY_ZONES: Record<string, Record<string, string>> = {
  US: {
    "new-york": "America/New_York", "brooklyn": "America/New_York", "boston": "America/New_York", "philadelphia": "America/New_York", "washington": "America/New_York",
    "washington-dc": "America/New_York", "atlanta": "America/New_York", "miami": "America/New_York", "orlando": "America/New_York", "charlotte": "America/New_York",
    "detroit": "America/Detroit", "baltimore": "America/New_York", "newark": "America/New_York", "jersey-city": "America/New_York", "raleigh": "America/New_York",
    "chicago": "America/Chicago", "houston": "America/Chicago", "dallas": "America/Chicago", "austin": "America/Chicago", "san-antonio": "America/Chicago",
    "minneapolis": "America/Chicago", "new-orleans": "America/Chicago", "nashville": "America/Chicago", "memphis": "America/Chicago", "st-louis": "America/Chicago",
    "kansas-city": "America/Chicago", "milwaukee": "America/Chicago", "oklahoma-city": "America/Chicago",
    "denver": "America/Denver", "salt-lake-city": "America/Denver", "albuquerque": "America/Denver", "phoenix": "America/Phoenix", "tucson": "America/Phoenix",
    "los-angeles": "America/Los_Angeles", "san-francisco": "America/Los_Angeles", "san-diego": "America/Los_Angeles", "san-jose": "America/Los_Angeles",
    "oakland": "America/Los_Angeles", "sacramento": "America/Los_Angeles", "seattle": "America/Los_Angeles", "portland": "America/Los_Angeles", "las-vegas": "America/Los_Angeles",
    "anchorage": "America/Anchorage", "honolulu": "Pacific/Honolulu",
  },
  CA: {
    "toronto": "America/Toronto", "ottawa": "America/Toronto", "montreal": "America/Toronto", "mississauga": "America/Toronto", "brampton": "America/Toronto", "hamilton": "America/Toronto",
    "vancouver": "America/Vancouver", "victoria": "America/Vancouver", "surrey": "America/Vancouver", "calgary": "America/Edmonton", "edmonton": "America/Edmonton",
    "winnipeg": "America/Winnipeg", "regina": "America/Regina", "saskatoon": "America/Regina", "halifax": "America/Halifax", "st-johns": "America/St_Johns",
  },
  MX: { "mexico-city": "America/Mexico_City", "guadalajara": "America/Mexico_City", "monterrey": "America/Monterrey", "cancun": "America/Cancun", "tijuana": "America/Tijuana" },
  BR: { "sao-paulo": "America/Sao_Paulo", "rio-de-janeiro": "America/Sao_Paulo", "brasilia": "America/Sao_Paulo", "salvador": "America/Bahia", "fortaleza": "America/Fortaleza", "recife": "America/Recife", "manaus": "America/Manaus" },
  AU: { "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne", "brisbane": "Australia/Brisbane", "perth": "Australia/Perth", "adelaide": "Australia/Adelaide", "darwin": "Australia/Darwin", "hobart": "Australia/Hobart", "canberra": "Australia/Sydney", "gold-coast": "Australia/Brisbane" },
  ID: { "jakarta": "Asia/Jakarta", "bali": "Asia/Makassar", "denpasar": "Asia/Makassar", "makassar": "Asia/Makassar" },
  ES: { "madrid": "Europe/Madrid", "barcelona": "Europe/Madrid", "las-palmas": "Atlantic/Canary" },
  CD: { "kinshasa": "Africa/Kinshasa", "lubumbashi": "Africa/Lubumbashi" },
};

/** The zones a country uses, its usual one first (Lagos for a code we don't know). */
export const zonesOf = (country: string | null | undefined): string[] => ZONES[(country ?? "").toUpperCase()] ?? [DEFAULT_ZONE];

/** Is `zone` a real zone this runtime knows? */
export function isZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone for a place: a known city's, else (a country with more than one) the host's device zone when it's one
 * of that country's, else the country's usual one.
 */
export function zoneForPlace(p: { country?: string | null; city?: string | null }, deviceZone?: string | null): string {
  const country = (p.country ?? "").toUpperCase();
  const zones = zonesOf(country);
  if (zones.length === 1) return zones[0];
  const city = CITY_ZONES[country]?.[(p.city ?? "").toLowerCase()];
  if (city) return city;
  if (deviceZone && zones.includes(deviceZone)) return deviceZone;
  return zones[0];
}

/** May an event in `country` use `zone`? (one of the country's, or a known city's) */
export function zoneFitsCountry(zone: string, country: string | null | undefined): boolean {
  const c = (country ?? "").toUpperCase();
  return zonesOf(c).includes(zone) || Object.values(CITY_ZONES[c] ?? {}).includes(zone);
}

/**
 * The zone to keep with times a client sent: the one it says it typed them in, when it's a real zone. An app or
 * page from before zones sends none and typed them in Lagos time, so that's Lagos.
 */
export const sentZone = (zone: string | null | undefined): string => (isZone(zone) ? zone : DEFAULT_ZONE);

/** The phone's or browser's own zone (undefined when it can't tell). */
export function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The wall clock in `zone` at `at` (formatToParts, or reading the formatted text where a runtime lacks it) */
function wallParts(zone: string, at: Date): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const opts: Intl.DateTimeFormatOptions = { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" };
  try {
    const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(at);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute"), s: g("second") };
  } catch {
    // "11/20/2026, 20:00:00"
    const m = /(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/.exec(at.toLocaleString("en-US", opts));
    if (!m) throw new Error("no zone");
    return { y: +m[3], mo: +m[1], d: +m[2], h: +m[4] % 24, mi: +m[5], s: +m[6] };
  }
}

function offsetMs(zone: string, at: Date): number {
  const p = wallParts(zone, at);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - at.getTime();
}

/** "2026-11-20" + "20:00" on the wall clock in `zone`, as an ISO instant (null when the inputs aren't a time). */
export function wallToIso(date: string, time: string, zone: string = DEFAULT_ZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let ms = guess;
  try {
    ms = guess - offsetMs(zone, new Date(guess));
    ms = guess - offsetMs(zone, new Date(ms)); // a second pass settles daylight-saving edges
  } catch {
    /* an unknown zone: as UTC */
  }
  const d = new Date(ms);
  return Number.isNaN(+d) ? null : d.toISOString();
}

/** An instant as { date: "2026-11-20", time: "20:00" } on the wall clock in `zone` (for editing). */
export function isoToWall(iso: string | Date, zone: string = DEFAULT_ZONE): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  let p;
  try {
    p = wallParts(zone, new Date(iso));
  } catch {
    p = wallParts(DEFAULT_ZONE, new Date(iso));
  }
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** The day ("2026-11-20") an instant falls on in `zone`; no zone = the device's own. */
export const dayKeyIn = (iso: string | Date, zone?: string) => new Date(iso).toLocaleDateString("en-CA", zone ? { timeZone: zone } : undefined);

/** "New York", "Los Angeles", "Lagos": a zone's city, for people */
export const zoneCity = (zone: string) => (zone.split("/").pop() ?? zone).replace(/_/g, " ");

/** A short name for a zone at a moment: "EST", "PST", "GMT", "GMT+3"; "WAT" for Lagos. */
export function zoneLabel(zone: string, at: string | Date = new Date()): string {
  if (zone === DEFAULT_ZONE) return "WAT";
  try {
    // "11/20/2026, 8:00 PM EST": the last word is the zone's name
    const text = new Date(at).toLocaleString("en-US", { timeZone: zone, timeZoneName: "short" });
    return /\s([A-Z][A-Za-z0-9:+-]*)$/.exec(text)?.[1] ?? "";
  } catch {
    return "";
  }
}

/** "2:00 AM your time" (with the day when it's another one): `iso` on the device's clock, when it's in another zone than `zone`; else "" */
export function yourTime(iso: string | null | undefined, zone: string | null | undefined, device: string | undefined): string {
  if (!iso || !device || !zone || device === zone) return "";
  const at = new Date(iso);
  const same = (z: string) => at.toLocaleDateString("en-CA", { timeZone: z });
  // the same moment on both clocks: nothing to add
  if (at.toLocaleTimeString("en-US", { timeZone: zone }) === at.toLocaleTimeString("en-US", { timeZone: device }) && same(zone) === same(device)) return "";
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: device });
  const day = same(zone) !== same(device) ? `${at.toLocaleDateString("en-GB", { weekday: "short", timeZone: device })} ` : "";
  return `${day}${time} your time`;
}
