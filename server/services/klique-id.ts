import "server-only";
import type { Types } from "mongoose";
import { KLIQUE_SLUG } from "@/lib/constants";
import { Community, type ICommunity } from "../models/Community";

/** Kept apart from klique.service so the access policy can use it without pulling in channels and users. */

export const isKlique = (c: Pick<ICommunity, "slug" | "official"> | null | undefined): boolean => !!c && !!c.official && c.slug === KLIQUE_SLUG;

let cachedId: Types.ObjectId | null = null;

/** Klique's id, or null before it exists. */
export async function kliqueId(): Promise<Types.ObjectId | null> {
  if (cachedId) return cachedId;
  const c = await Community.findOne({ slug: KLIQUE_SLUG, official: true }).select("_id").lean<{ _id: Types.ObjectId }>();
  if (c) cachedId = c._id;
  return cachedId;
}

export const rememberKliqueId = (id: Types.ObjectId) => {
  cachedId = id;
};
