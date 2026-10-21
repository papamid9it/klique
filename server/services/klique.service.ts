import "server-only";
import type { Types } from "mongoose";
import { KLIQUE_SLUG } from "@/lib/constants";
import { adminEmails } from "../env";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import { User } from "../models/User";
import { ensureDefaultChannels } from "./channels.service";
import { recountMembers } from "./helpers";
import { rememberKliqueId } from "./klique-id";

/**
 * "Klique", the default community. Everyone joins it at signup and nobody can leave; only site admins post
 * events there, and those events are the ones everybody sees (filtered by place as usual). Every other event
 * belongs to its own community or group and only their members see it. It's owned by the first ADMIN_EMAILS
 * account and created the first time it's needed (or by `npm run migrate:klique`).
 */

export { isKlique, kliqueId } from "./klique-id";

/** The first account in ADMIN_EMAILS (Klique's owner), or `fallback`. */
async function siteOwnerId(fallback?: Types.ObjectId): Promise<Types.ObjectId | null> {
  const emails = [...adminEmails()];
  for (const email of emails) {
    const u = await User.findOne({ email }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (u) return u._id;
  }
  return fallback ?? null;
}

/** Klique itself, created if it doesn't exist yet (owned by the site owner, or `fallbackOwner`). */
export async function ensureKlique(fallbackOwner?: Types.ObjectId): Promise<ICommunity | null> {
  const found = await Community.findOne({ slug: KLIQUE_SLUG, official: true }).lean<ICommunity>();
  if (found) return found;
  const ownerId = await siteOwnerId(fallbackOwner);
  if (!ownerId) return null; // no site admin has signed up yet
  const fields = {
    slug: KLIQUE_SLUG,
    name: "Klique",
    description: "Everyone on Klique is here. Announcements from the Klique team, and the events Klique puts on for everybody.",
    interest: "music" as const,
    country: "NG",
    region: "",
    city: "lagos",
    privacy: "public" as const,
    groupPolicy: "off" as const,
    ownerId,
    official: true,
  };
  let doc: ICommunity;
  try {
    doc = (await Community.create(fields)).toObject();
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e;
    const again = await Community.findOne({ slug: KLIQUE_SLUG, official: true }).lean<ICommunity>();
    if (again) return again;
    // the old one-official-community-per-city index (from "Klique Lagos" days) is in the way: drop it, retry
    await Community.collection.dropIndex("country_1_city_1").catch(() => {});
    doc = (await Community.create(fields)).toObject();
  }
  await Membership.updateOne({ userId: ownerId, communityId: doc._id, subcommunityId: null }, { $set: { role: "owner", status: "active" } }, { upsert: true });
  await ensureDefaultChannels(doc._id, ownerId);
  await recountMembers(doc._id, null);
  rememberKliqueId(doc._id);
  return doc;
}

/** Put someone in Klique (signup). Quietly does nothing before Klique exists and no site admin can own it. */
export async function joinKlique(userId: Types.ObjectId): Promise<void> {
  const k = await ensureKlique();
  if (!k) return;
  const r = await Membership.updateOne({ userId, communityId: k._id, subcommunityId: null }, { $setOnInsert: { role: "member", status: "active" } }, { upsert: true }); // never un-bans
  if (r.upsertedCount) await Community.updateOne({ _id: k._id }, { $inc: { memberCount: 1 } });
}
