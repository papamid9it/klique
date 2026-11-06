import "server-only";
import { getCityEntry, getRegion, isCountryCode, regionName, slugify } from "@/lib/places";

/** Nigeria's state codes, as the host reports them. */
const NG_STATES: Record<string, string> = { AB: "abia", AD: "adamawa", AK: "akwa-ibom", AN: "anambra", BA: "bauchi", BY: "bayelsa", BE: "benue", BO: "borno", CR: "cross-river", DE: "delta", EB: "ebonyi", ED: "edo", EK: "ekiti", EN: "enugu", FC: "fct-abuja", GO: "gombe", IM: "imo", JI: "jigawa", KD: "kaduna", KN: "kano", KT: "katsina", KE: "kebbi", KO: "kogi", KW: "kwara", LA: "lagos", NA: "nasarawa", NI: "niger", OG: "ogun", ON: "ondo", OS: "osun", OY: "oyo", PL: "plateau", RI: "rivers", SO: "sokoto", TA: "taraba", YO: "yobe", ZA: "zamfara" };

export interface PlaceGuess {
  country: string;
  region: string;
  city: string;
}

/**
 * A rough guess at where someone is, from the network they're on (the host works it out from their IP; nothing is
 * stored, no permission is asked, and it's only ever a starting point they can change). Null when it can't tell.
 */
export function guessPlace(headers: Headers): PlaceGuess | null {
  const country = (headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  if (!isCountryCode(country)) return null;
  const code = (headers.get("x-vercel-ip-country-region") ?? "").toUpperCase();
  let cityText = "";
  try {
    cityText = decodeURIComponent(headers.get("x-vercel-ip-city") ?? "");
  } catch {
    /* a name we can't read: go by the state */
  }
  const city = cityText ? slugify(cityText) : "";
  const known = getCityEntry(country, city);
  const fromCode = country === "NG" ? NG_STATES[code] : undefined;
  const region = fromCode ?? known?.region ?? "";
  const regionOk = region && getRegion(country, region) ? region : "";
  // a state with no city: its name stands in, and they can change it
  const place = city || (regionOk ? slugify(regionName(country, regionOk)) : "");
  return place ? { country, region: regionOk, city: place } : null;
}
