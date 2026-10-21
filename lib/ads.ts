/**
 * Ad pricing and the words for each step, shared by the site admin's settings, the "Advertise" form and the
 * server (which always recomputes the price itself). Prices are per day, per placement, in naira; how far an
 * ad reaches multiplies it.
 */
export const AD_PLACEMENTS = [
  { id: "home-feed", label: "Homepage feed", hint: "Between the event rows on the homepage. The most seen spot." },
  { id: "home-rail", label: "Homepage side panel", hint: "The column beside the homepage on big screens." },
  { id: "events-list", label: "Events page", hint: "In the list on the Events page." },
  { id: "event-page", label: "Event pages", hint: "On other events' pages, under the RSVP button." },
  { id: "search", label: "Search results", hint: "At the top of search results." },
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number]["id"];

export const AD_REACHES = [
  { id: "city", label: "One city", hint: "People looking at events in that city." },
  { id: "country", label: "Whole country", hint: "Everyone browsing that country." },
  { id: "world", label: "Everywhere", hint: "Everyone, wherever they are." },
] as const;
export type AdReach = (typeof AD_REACHES)[number]["id"];

export interface AdPricing {
  currency: "NGN";
  /** naira per day for each placement */
  perDay: Record<AdPlacement, number>;
  /** price multiplier for each reach */
  reach: Record<AdReach, number>;
  minDays: number;
  maxDays: number;
}

export const DEFAULT_AD_PRICING: AdPricing = {
  currency: "NGN",
  perDay: { "home-feed": 10000, "home-rail": 6000, "events-list": 5000, "event-page": 3000, search: 3000 },
  reach: { city: 1, country: 2, world: 3 },
  minDays: 1,
  maxDays: 30,
};

/** Total in naira for these placements, this reach, this many days (rounded to ₦100). */
export function adPrice(p: AdPricing, placements: AdPlacement[], reach: AdReach, days: number): number {
  const perDay = [...new Set(placements)].reduce((sum, id) => sum + (p.perDay[id] ?? 0), 0);
  return Math.round((perDay * (p.reach[reach] ?? 1) * days) / 100) * 100;
}

/** Fill in anything missing from saved pricing with the defaults. */
export function pricingOf(stored: unknown): AdPricing {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<AdPricing>;
  return {
    currency: "NGN",
    perDay: { ...DEFAULT_AD_PRICING.perDay, ...(s.perDay ?? {}) },
    reach: { ...DEFAULT_AD_PRICING.reach, ...(s.reach ?? {}) },
    minDays: s.minDays ?? DEFAULT_AD_PRICING.minDays,
    maxDays: s.maxDays ?? DEFAULT_AD_PRICING.maxDays,
  };
}
