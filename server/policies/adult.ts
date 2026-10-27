import "server-only";
import type { Types } from "mongoose";
import { Community, type ICommunity } from "../models/Community";
import type { IUser } from "../models/User";

/**
 * 18+ communities (Community.adult) and the ones among them that allow explicit content (Community.explicit).
 * Both must be private. Who may see one, and what stays out of everything else:
 *
 *  - 18+: signed in, a date of birth saying 18 or older, and a one-time "I'm 18 or older" (User.adultConfirmedAt).
 *  - Explicit: all that, plus "Show explicit content" switched on in Settings (User.explicitOptInAt).
 *  - Anyone else is an outsider there (spaceAccess), and under-18s don't even learn it exists (not found).
 *  - Their posts, events, crews and boards never reach the home feed, Discover, search, trending, suggestions,
 *    share cards or anyone else's lists; explicit ones never even reach their own members' notification previews.
 *  - No money in explicit communities (donations, contributions, payouts, ads), no ads in or from any 18+ one.
 */

export const ADULT_AGE = 18;

/** Whole years old on `at` (null without a date of birth). */
export function ageOn(dob: Date | null | undefined, at = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  let age = at.getUTCFullYear() - d.getUTCFullYear();
  if (at.getUTCMonth() < d.getUTCMonth() || (at.getUTCMonth() === d.getUTCMonth() && at.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export const isAdult = (u: Pick<IUser, "dob"> | null | undefined) => (ageOn(u?.dob) ?? 0) >= ADULT_AGE;

/**
 * What stands between this person and an 18+ community (null: nothing):
 * "sign_in", "under_18" (never shown it exists), "dob_required", "confirm_adult" (the one-time confirmation), or
 * "explicit_optin" (an explicit community, with Show explicit content off in Settings).
 */
export type AdultGate = "sign_in" | "under_18" | "dob_required" | "confirm_adult" | "explicit_optin" | null;

export function adultGate(c: Pick<ICommunity, "adult" | "explicit">, viewer: Pick<IUser, "dob" | "adultConfirmedAt" | "explicitOptInAt"> | null): AdultGate {
  if (!c.adult) return null;
  if (!viewer) return "sign_in";
  const age = ageOn(viewer.dob);
  if (age === null) return "dob_required";
  if (age < ADULT_AGE) return "under_18";
  if (!viewer.adultConfirmedAt) return "confirm_adult";
  if (c.explicit && !viewer.explicitOptInAt) return "explicit_optin";
  return null;
}

/** For queries that list communities to anyone: leave out every 18+ one. */
export const notAdult = { adult: { $ne: true } } as const;

let cache: { at: number; ids: Types.ObjectId[] } | null = null;
/** The 18+ communities' ids (kept for 30 seconds), to keep their posts and events out of feeds and search. */
export async function adultCommunityIds(): Promise<Types.ObjectId[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.ids;
  const ids = (await Community.find({ adult: true }).select("_id").lean<{ _id: Types.ObjectId }[]>()).map((c) => c._id);
  cache = { at: Date.now(), ids };
  return ids;
}
/** Forget the cached list (a community was marked or unmarked 18+). */
export const forgetAdultCommunities = () => void (cache = null);

/** These community ids without the 18+ ones (for anything listed outside the community itself). */
export async function withoutAdult<T extends { toString(): string }>(ids: T[]): Promise<T[]> {
  if (!ids.length) return ids;
  const adult = new Set((await adultCommunityIds()).map(String));
  return adult.size ? ids.filter((id) => !adult.has(id.toString())) : ids;
}

let explicitCache: { at: number; slugs: Set<string> } | null = null;
/** Is this a community with explicit content (by its slug; kept for 30 seconds)? Notifications use it to say nothing. */
export async function isExplicitSlug(slug: string): Promise<boolean> {
  if (!explicitCache || Date.now() - explicitCache.at > 30_000) {
    const rows = await Community.find({ explicit: true }).select("slug").lean<{ slug: string }[]>();
    explicitCache = { at: Date.now(), slugs: new Set(rows.map((r) => r.slug)) };
  }
  return explicitCache.slugs.has(slug.toLowerCase());
}
