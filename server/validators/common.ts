import { z } from "zod";
import { HANDLE_REGEX, INTEREST_IDS, LIMITS, type InterestId } from "@/lib/constants";
import { COUNTRY_CODES, parseScope } from "@/lib/places";

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
/** ... and defaulted at signup. */
export const placeDefault = { country: countryCode.default("NG"), region: regionSlug, city: citySlug.default("lagos") };

export const interestId = z.enum(INTEREST_IDS as [InterestId, ...InterestId[]]);

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
  .regex(HANDLE_REGEX, "Letters, numbers and underscores only");

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/** Empty string -> undefined, so optional query params can be left blank. */
export const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** "Where to look": world | continent:africa | country:NG | region:NG:lagos | city:NG:lagos */
export const whereParam = z.preprocess(blankToUndef, z.string().max(60).refine((v) => parseScope(v) !== null, "Unknown place").optional());
