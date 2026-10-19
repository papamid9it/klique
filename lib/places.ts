/**
 * Places: continent → country → state/region → city. Shared by the server (validation, query filters)
 * and the UI (pickers, labels). Everything stored on a user / community / event is a flat
 * `{ country: "NG", region: "lagos", city: "lagos" }`:
 *   - `country` is an ISO-3166 alpha-2 code from COUNTRIES,
 *   - `region` is a slug from REGIONS[country] (or "" — most countries have no region list),
 *   - `city` is a slug. Cities in CITIES get a proper name; any other city/town works too (typed free-hand).
 * Add a country, region or city here and it shows up in every picker and filter.
 */

export type ContinentId = "africa" | "europe" | "north-america" | "south-america" | "asia" | "oceania";

export const CONTINENTS: { id: ContinentId; name: string }[] = [
  { id: "africa", name: "Africa" },
  { id: "europe", name: "Europe" },
  { id: "north-america", name: "North America" },
  { id: "south-america", name: "South America" },
  { id: "asia", name: "Asia" },
  { id: "oceania", name: "Oceania" },
];

type C = [code: string, name: string, continent: ContinentId, currency: string];
const COUNTRY_ROWS: C[] = [
  // Africa (all 54)
  ["DZ", "Algeria", "africa", "DZD"], ["AO", "Angola", "africa", "AOA"], ["BJ", "Benin", "africa", "XOF"], ["BW", "Botswana", "africa", "BWP"],
  ["BF", "Burkina Faso", "africa", "XOF"], ["BI", "Burundi", "africa", "BIF"], ["CV", "Cabo Verde", "africa", "CVE"], ["CM", "Cameroon", "africa", "XAF"],
  ["CF", "Central African Republic", "africa", "XAF"], ["TD", "Chad", "africa", "XAF"], ["KM", "Comoros", "africa", "KMF"], ["CG", "Congo", "africa", "XAF"],
  ["CD", "DR Congo", "africa", "CDF"], ["CI", "Côte d'Ivoire", "africa", "XOF"], ["DJ", "Djibouti", "africa", "DJF"], ["EG", "Egypt", "africa", "EGP"],
  ["GQ", "Equatorial Guinea", "africa", "XAF"], ["ER", "Eritrea", "africa", "ERN"], ["SZ", "Eswatini", "africa", "SZL"], ["ET", "Ethiopia", "africa", "ETB"],
  ["GA", "Gabon", "africa", "XAF"], ["GM", "Gambia", "africa", "GMD"], ["GH", "Ghana", "africa", "GHS"], ["GN", "Guinea", "africa", "GNF"],
  ["GW", "Guinea-Bissau", "africa", "XOF"], ["KE", "Kenya", "africa", "KES"], ["LS", "Lesotho", "africa", "LSL"], ["LR", "Liberia", "africa", "LRD"],
  ["LY", "Libya", "africa", "LYD"], ["MG", "Madagascar", "africa", "MGA"], ["MW", "Malawi", "africa", "MWK"], ["ML", "Mali", "africa", "XOF"],
  ["MR", "Mauritania", "africa", "MRU"], ["MU", "Mauritius", "africa", "MUR"], ["MA", "Morocco", "africa", "MAD"], ["MZ", "Mozambique", "africa", "MZN"],
  ["NA", "Namibia", "africa", "NAD"], ["NE", "Niger", "africa", "XOF"], ["NG", "Nigeria", "africa", "NGN"], ["RW", "Rwanda", "africa", "RWF"],
  ["ST", "São Tomé and Príncipe", "africa", "STN"], ["SN", "Senegal", "africa", "XOF"], ["SC", "Seychelles", "africa", "SCR"], ["SL", "Sierra Leone", "africa", "SLE"],
  ["SO", "Somalia", "africa", "SOS"], ["ZA", "South Africa", "africa", "ZAR"], ["SS", "South Sudan", "africa", "SSP"], ["SD", "Sudan", "africa", "SDG"],
  ["TZ", "Tanzania", "africa", "TZS"], ["TG", "Togo", "africa", "XOF"], ["TN", "Tunisia", "africa", "TND"], ["UG", "Uganda", "africa", "UGX"],
  ["ZM", "Zambia", "africa", "ZMW"], ["ZW", "Zimbabwe", "africa", "USD"],
  // Europe
  ["GB", "United Kingdom", "europe", "GBP"], ["IE", "Ireland", "europe", "EUR"], ["FR", "France", "europe", "EUR"], ["DE", "Germany", "europe", "EUR"],
  ["ES", "Spain", "europe", "EUR"], ["PT", "Portugal", "europe", "EUR"], ["IT", "Italy", "europe", "EUR"], ["NL", "Netherlands", "europe", "EUR"],
  ["BE", "Belgium", "europe", "EUR"], ["SE", "Sweden", "europe", "SEK"], ["CH", "Switzerland", "europe", "CHF"],
  // Americas
  ["US", "United States", "north-america", "USD"], ["CA", "Canada", "north-america", "CAD"], ["MX", "Mexico", "north-america", "MXN"],
  ["JM", "Jamaica", "north-america", "JMD"], ["TT", "Trinidad and Tobago", "north-america", "TTD"],
  ["BR", "Brazil", "south-america", "BRL"], ["AR", "Argentina", "south-america", "ARS"], ["CO", "Colombia", "south-america", "COP"],
  // Asia & Oceania
  ["AE", "United Arab Emirates", "asia", "AED"], ["SA", "Saudi Arabia", "asia", "SAR"], ["TR", "Türkiye", "asia", "TRY"], ["IN", "India", "asia", "INR"],
  ["CN", "China", "asia", "CNY"], ["JP", "Japan", "asia", "JPY"], ["KR", "South Korea", "asia", "KRW"], ["SG", "Singapore", "asia", "SGD"],
  ["ID", "Indonesia", "asia", "IDR"], ["PH", "Philippines", "asia", "PHP"],
  ["AU", "Australia", "oceania", "AUD"], ["NZ", "New Zealand", "oceania", "NZD"],
];

export interface Country {
  code: string;
  name: string;
  continent: ContinentId;
  currency: string;
}
export const COUNTRIES: Country[] = COUNTRY_ROWS.map(([code, name, continent, currency]) => ({ code, name, continent, currency }));
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const DEFAULT_COUNTRY = "NG";

export const getCountry = (code: string | null | undefined): Country | undefined => (code ? COUNTRY_BY_CODE.get(code.toUpperCase()) : undefined);
export const isCountryCode = (v: unknown): v is string => typeof v === "string" && COUNTRY_BY_CODE.has(v);
export const countryName = (code: string) => getCountry(code)?.name ?? code;
export const countriesOf = (continent: ContinentId) => COUNTRIES.filter((c) => c.continent === continent);
export const currencyOf = (country: string) => getCountry(country)?.currency ?? "USD";

/** 🇳🇬 — drawn from the two-letter code, so no flag table to maintain. */
export function flag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)));
}

/* ------------------------------ regions ------------------------------ */

export interface Region {
  slug: string;
  name: string;
}
const r = (...names: string[]): Region[] => names.map((name) => ({ name, slug: slugify(name) }));

export const REGION_KIND: Record<string, string> = { NG: "State", GH: "Region", ZA: "Province", KE: "County" };
export const REGIONS: Record<string, Region[]> = {
  NG: r("Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"),
  GH: r("Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"),
  ZA: r("Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"),
  KE: r("Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kiambu", "Uasin Gishu", "Machakos", "Kajiado", "Nyeri", "Kilifi"),
};
export const regionsOf = (country: string): Region[] => REGIONS[country] ?? [];
export const getRegion = (country: string, slug: string | null | undefined) => (slug ? regionsOf(country).find((x) => x.slug === slug) : undefined);
export const regionName = (country: string, slug: string) => getRegion(country, slug)?.name ?? prettify(slug);

/* ------------------------------- cities ------------------------------ */

export interface CityEntry {
  slug: string;
  name: string;
  country: string;
  region?: string;
}
const c = (country: string, region: string | undefined, ...names: string[]): CityEntry[] => names.map((name) => ({ country, region, name, slug: slugify(name) }));

export const CITIES: CityEntry[] = [
  ...c("NG", "lagos", "Lagos"), ...c("NG", "fct-abuja", "Abuja"), ...c("NG", "rivers", "Port Harcourt"), ...c("NG", "oyo", "Ibadan"), ...c("NG", "kano", "Kano"),
  ...c("NG", "enugu", "Enugu"), ...c("NG", "edo", "Benin City"), ...c("NG", "kaduna", "Kaduna"), ...c("NG", "ogun", "Abeokuta"), ...c("NG", "imo", "Owerri"),
  ...c("NG", "delta", "Warri", "Asaba"), ...c("NG", "akwa-ibom", "Uyo"), ...c("NG", "cross-river", "Calabar"), ...c("NG", "plateau", "Jos"), ...c("NG", "kwara", "Ilorin"),
  ...c("NG", "ondo", "Akure"), ...c("NG", "anambra", "Awka", "Onitsha"), ...c("NG", "borno", "Maiduguri"),
  ...c("GH", "greater-accra", "Accra", "Tema"), ...c("GH", "ashanti", "Kumasi"), ...c("GH", "northern", "Tamale"), ...c("GH", "western", "Takoradi"), ...c("GH", "central", "Cape Coast"), ...c("GH", "volta", "Ho"),
  ...c("KE", "nairobi", "Nairobi"), ...c("KE", "mombasa", "Mombasa"), ...c("KE", "kisumu", "Kisumu"), ...c("KE", "nakuru", "Nakuru"),
  ...c("ZA", "gauteng", "Johannesburg", "Pretoria"), ...c("ZA", "western-cape", "Cape Town"), ...c("ZA", "kwazulu-natal", "Durban"),
  ...c("RW", undefined, "Kigali"), ...c("UG", undefined, "Kampala"), ...c("TZ", undefined, "Dar es Salaam"), ...c("ET", undefined, "Addis Ababa"), ...c("EG", undefined, "Cairo", "Alexandria"),
  ...c("MA", undefined, "Casablanca", "Marrakech"), ...c("SN", undefined, "Dakar"), ...c("CI", undefined, "Abidjan"), ...c("ZM", undefined, "Lusaka"), ...c("ZW", undefined, "Harare"),
  ...c("AO", undefined, "Luanda"), ...c("TN", undefined, "Tunis"), ...c("DZ", undefined, "Algiers"), ...c("TG", undefined, "Lomé"), ...c("BJ", undefined, "Cotonou"), ...c("CM", undefined, "Douala", "Yaoundé"),
  ...c("MU", undefined, "Port Louis"), ...c("NA", undefined, "Windhoek"), ...c("BW", undefined, "Gaborone"), ...c("SL", undefined, "Freetown"), ...c("LR", undefined, "Monrovia"),
  ...c("GB", undefined, "London", "Manchester", "Birmingham"), ...c("FR", undefined, "Paris"), ...c("DE", undefined, "Berlin"), ...c("NL", undefined, "Amsterdam"), ...c("PT", undefined, "Lisbon"), ...c("ES", undefined, "Madrid"),
  ...c("US", undefined, "New York", "Los Angeles", "Atlanta", "Houston"), ...c("CA", undefined, "Toronto", "Vancouver"), ...c("BR", undefined, "São Paulo"), ...c("JM", undefined, "Kingston"),
  ...c("AE", undefined, "Dubai"), ...c("IN", undefined, "Mumbai"), ...c("SG", undefined, "Singapore"), ...c("JP", undefined, "Tokyo"), ...c("AU", undefined, "Sydney"),
];

export const NEIGHBORHOODS: Record<string, string[]> = {
  "NG.lagos": ["Lekki Phase 1", "Victoria Island", "Ikoyi", "Yaba", "Surulere", "Ikeja", "Ajah", "Lagos Island", "Maryland"],
  "NG.abuja": ["Wuse 2", "Maitama", "Garki", "Jabi", "Gwarinpa", "Asokoro", "Utako"],
  "GH.accra": ["Osu", "Labone", "East Legon", "Cantonments", "Airport Residential", "Jamestown"],
  "KE.nairobi": ["Westlands", "Kilimani", "Karen", "Lavington", "CBD", "Kileleshwa"],
  "ZA.cape-town": ["Woodstock", "Sea Point", "Observatory", "City Bowl"],
  "ZA.johannesburg": ["Maboneng", "Melville", "Sandton", "Braamfontein"],
};
export const neighborhoodsOf = (country: string, city: string) => NEIGHBORHOODS[`${country}.${city}`] ?? [];

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
export const prettify = (slug: string) => slug.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export const getCityEntry = (country: string, slug: string | null | undefined) => (slug ? CITIES.find((x) => x.country === country && x.slug === slug) : undefined);
export const cityName = (country: string, slug: string) => getCityEntry(country, slug)?.name ?? prettify(slug);
export const citiesIn = (country: string, region?: string) => CITIES.filter((x) => x.country === country && (!region || x.region === region));
/** Cities worth suggesting for a country (and state), for a datalist. */
export const suggestCities = citiesIn;

/* -------------------------------- place ------------------------------ */

/** What is stored on a user, community and event. */
export interface Place {
  country: string;
  region: string;
  city: string;
}

/** "Lagos, Nigeria" — city and country, the way you'd write it on a flyer. */
export function placeLabel(p: Partial<Place> | null | undefined): string {
  if (!p?.country) return p?.city ? prettify(p.city) : "Anywhere";
  const parts = [p.city ? cityName(p.country, p.city) : p.region ? regionName(p.country, p.region) : "", countryName(p.country)];
  return parts.filter(Boolean).join(", ");
}
/** "Lagos" (or the state / country when there is no city). */
export function placeShort(p: Partial<Place> | null | undefined): string {
  if (!p?.country) return p?.city ? prettify(p.city) : "Anywhere";
  return p.city ? cityName(p.country, p.city) : p.region ? regionName(p.country, p.region) : countryName(p.country);
}

/* ------------------------------- scopes ------------------------------ */
/**
 * A scope is "where to look": everywhere, a continent, a country, a state or a city.
 * Serialised as `world` | `continent:africa` | `country:NG` | `region:NG:lagos` | `city:NG:lagos`.
 */
export type Scope =
  | { level: "world" }
  | { level: "continent"; continent: ContinentId }
  | { level: "country"; country: string }
  | { level: "region"; country: string; region: string }
  | { level: "city"; country: string; city: string };

export const WORLD: Scope = { level: "world" };

export function scopeToString(s: Scope): string {
  switch (s.level) {
    case "world": return "world";
    case "continent": return `continent:${s.continent}`;
    case "country": return `country:${s.country}`;
    case "region": return `region:${s.country}:${s.region}`;
    case "city": return `city:${s.country}:${s.city}`;
  }
}

const SLUG = /^[a-z0-9-]{1,40}$/;
export function parseScope(v: unknown): Scope | null {
  if (typeof v !== "string") return null;
  const [kind, a, b] = v.split(":");
  if (kind === "world" && a === undefined) return WORLD;
  if (kind === "continent" && CONTINENTS.some((x) => x.id === a) && b === undefined) return { level: "continent", continent: a as ContinentId };
  if (kind === "country" && isCountryCode(a) && b === undefined) return { level: "country", country: a };
  if (kind === "region" && isCountryCode(a) && b && SLUG.test(b)) return { level: "region", country: a, region: b };
  if (kind === "city" && isCountryCode(a) && b && SLUG.test(b)) return { level: "city", country: a, city: b };
  return null;
}

export function scopeLabel(s: Scope): string {
  switch (s.level) {
    case "world": return "Everywhere";
    case "continent": return CONTINENTS.find((x) => x.id === s.continent)?.name ?? "Everywhere";
    case "country": return countryName(s.country);
    case "region": return regionName(s.country, s.region);
    case "city": return cityName(s.country, s.city);
  }
}
/** A line for the second row: "Lagos · Nigeria". */
export function scopeTrail(s: Scope): string {
  switch (s.level) {
    case "world": return "All events, worldwide";
    case "continent": return "Whole continent";
    case "country": return CONTINENTS.find((x) => x.id === getCountry(s.country)?.continent)?.name ?? "";
    case "region": return countryName(s.country);
    case "city": return [getRegion(s.country, getCityEntry(s.country, s.city)?.region)?.name, countryName(s.country)].filter(Boolean).join(" · ");
  }
}
export function scopeFlag(s: Scope): string {
  if (s.level === "world") return "🌍";
  if (s.level === "continent") return "🌍";
  return flag(s.country);
}

/** The mongo filter fragment for a scope. Empty for "everywhere". */
export function scopeFilter(s: Scope | null | undefined): Record<string, unknown> {
  if (!s) return {};
  switch (s.level) {
    case "world": return {};
    case "continent": return { country: { $in: countriesOf(s.continent).map((x) => x.code) } };
    case "country": return { country: s.country };
    case "region": return { country: s.country, region: s.region };
    case "city": return { country: s.country, city: s.city };
  }
}

/** One step up (city → state → country → continent → everywhere). */
export function scopeParent(s: Scope): Scope | null {
  switch (s.level) {
    case "world": return null;
    case "continent": return WORLD;
    case "country": return { level: "continent", continent: getCountry(s.country)?.continent ?? "africa" };
    case "region": return { level: "country", country: s.country };
    case "city": {
      const region = getCityEntry(s.country, s.city)?.region;
      return region ? { level: "region", country: s.country, region } : { level: "country", country: s.country };
    }
  }
}
export function scopeTrailList(s: Scope): Scope[] {
  const out: Scope[] = [];
  for (let cur: Scope | null = s; cur; cur = scopeParent(cur)) out.unshift(cur);
  return out;
}

/** What you can drill into from here. */
export function scopeChildren(s: Scope): Scope[] {
  switch (s.level) {
    case "world": return CONTINENTS.map((x) => ({ level: "continent", continent: x.id }));
    case "continent": return countriesOf(s.continent).map((x) => ({ level: "country", country: x.code }));
    case "country": {
      const regions = regionsOf(s.country);
      if (regions.length) return regions.map((x) => ({ level: "region", country: s.country, region: x.slug }));
      return citiesIn(s.country).map((x) => ({ level: "city", country: s.country, city: x.slug }));
    }
    case "region": return citiesIn(s.country, s.region).map((x) => ({ level: "city", country: s.country, city: x.slug }));
    case "city": return [];
  }
}

/** The scope a place's own level, e.g. a profile → their city. */
export function scopeFromPlace(p: Partial<Place> | null | undefined, level: "city" | "region" | "country" = "city"): Scope {
  if (!p?.country || !isCountryCode(p.country)) return WORLD;
  if (level === "city" && p.city) return { level: "city", country: p.country, city: p.city };
  if ((level === "city" || level === "region") && p.region) return { level: "region", country: p.country, region: p.region };
  return { level: "country", country: p.country };
}

/** Does this stored place fall inside the scope? (client-side mirror of `scopeFilter`) */
export function placeInScope(p: Partial<Place>, s: Scope): boolean {
  switch (s.level) {
    case "world": return true;
    case "continent": return getCountry(p.country)?.continent === s.continent;
    case "country": return p.country === s.country;
    case "region": return p.country === s.country && p.region === s.region;
    case "city": return p.country === s.country && p.city === s.city;
  }
}

/** Type-ahead for the place picker: matches continents, countries, states and cities. */
export function searchScopes(q: string, limit = 12): Scope[] {
  const needle = slugify(q).replace(/-/g, "");
  if (!needle) return [];
  const norm = (s: string) => slugify(s).replace(/-/g, "");
  const hits: { s: Scope; rank: number }[] = [];
  const push = (s: Scope, name: string) => {
    const n = norm(name);
    if (n.startsWith(needle)) hits.push({ s, rank: 0 });
    else if (n.includes(needle)) hits.push({ s, rank: 1 });
  };
  for (const x of CONTINENTS) push({ level: "continent", continent: x.id }, x.name);
  for (const x of COUNTRIES) push({ level: "country", country: x.code }, x.name);
  for (const [country, list] of Object.entries(REGIONS)) for (const x of list) push({ level: "region", country, region: x.slug }, x.name);
  for (const x of CITIES) push({ level: "city", country: x.country, city: x.slug }, x.name);
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.s);
}

/** Validate a stored place (used by the API). Cities may be any slug; countries and regions must be known. */
export function validatePlace(p: { country: string; region?: string; city: string }): string | null {
  if (!isCountryCode(p.country)) return "Pick a country.";
  if (p.region && regionsOf(p.country).length && !getRegion(p.country, p.region)) return "That state / region doesn't belong to that country.";
  if (!SLUG.test(p.city)) return "Enter a city or town.";
  return null;
}
