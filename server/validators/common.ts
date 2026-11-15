import { z } from "zod";
import { HANDLE_REGEX, isInterestId, LIMITS } from "@/lib/constants";
import { CONTINENTS, COUNTRY_CODES, parseScope } from "@/lib/places";
import { RESERVED_HANDLES } from "@/lib/mentions";

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
export const isObjectId = (v: unknown): v is string => typeof v === "string" && OBJECT_ID_REGEX.test(v);

export const objectId = z.string().regex(OBJECT_ID_REGEX, "Invalid id");

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,40}$/, "Use letters, numbers and dashes");
export const countryCode = z.enum(COUNTRY_CODES as [string, ...string[]]);
/** A city or town: any slug (the gazetteer in lib/places.ts only supplies nice names). */
export const citySlug = slug;
export const regionSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{0,40}$/).default("");

/** Where something is: required on create ... */
export const placeRequired = { country: countryCode, region: regionSlug, city: citySlug };
/** ... optional on update (send country + city together) ... */
export const placeOptional = { country: countryCode.optional(), region: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{0,40}$/).optional(), city: citySlug.optional() };
/**
 * A community's reach: as wide as it likes. The fields set say how far it reaches: a city (country + city), a state
 * (country + region), a whole country (country only), a continent (continent only) or the world (nothing).
 */
const continentId = z.enum(CONTINENTS.map((c) => c.id) as [string, ...string[]]);
export const placeReach = {
  country: z.union([countryCode, z.literal("")]).default(""),
  region: regionSlug,
  city: z.union([citySlug, z.literal("")]).default(""),
  continent: z.union([continentId, z.literal("")]).default(""),
  /** what the person picked (a city, a state…): when sent, the fields must fill it (else "Pick a state") */
  reach: z.enum(["city", "region", "country", "continent", "world"]).optional(),
};
export const placeReachOptional = {
  country: z.union([countryCode, z.literal("")]).optional(),
  region: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{0,40}$/).optional(),
  city: z.union([citySlug, z.literal("")]).optional(),
  continent: z.union([continentId, z.literal("")]).optional(),
  reach: z.enum(["city", "region", "country", "continent", "world"]).optional(),
};
/** ... and defaulted at signup. */
export const placeDefault = { country: countryCode.default("NG"), region: regionSlug, city: citySlug.default("lagos") };

/** A category from the admin's list (hidden ones too, so things already using them still save). The list is
 * loaded for each request in withApi (server/services/categories.service.ts). */
export const interestId = z.string().trim().toLowerCase().refine(isInterestId, "Pick a category from the list.");

/** http(s) URL or empty. Stops javascript:/data: URLs ever being stored and rendered. */
export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), "Must be a valid http(s) link");

export const handle = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.handleMin, `At least ${LIMITS.handleMin} characters`)
  .max(LIMITS.handleMax, `At most ${LIMITS.handleMax} characters`)
  .regex(HANDLE_REGEX, "Letters, numbers and underscores only")
  // @everyone, @all, @here and @channel are mass mentions
  .refine((h) => !RESERVED_HANDLES.has(h), "That handle is taken");

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/** Empty string -> undefined, so optional query params can be left blank. */
export const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** "Where to look": world | continent:africa | country:NG | region:NG:lagos | city:NG:lagos */
export const whereParam = z.preprocess(blankToUndef, z.string().max(60).refine((v) => parseScope(v) !== null, "Unknown place").optional());
