import "server-only";
import type { InterestId } from "@/lib/constants";
import { cityName } from "@/lib/places";
import { Community, type ICommunity } from "../models/Community";
import { Membership } from "../models/Membership";
import type { IUser } from "../models/User";
import { ensureDefaultChannels } from "./channels.service";
import { recountMembers, uniqueCommunitySlug } from "./helpers";

/**
 * Every event lives in a community. Events Klique itself puts up (posted by a site admin, or found by the event
 * finder and approved) go into that city's official community, "Klique Lagos", "Klique Accra" and so on: owned
 * by a site admin, public, and created the first time a city needs one.
 */
export async function officialCommunityFor(owner: Pick<IUser, "_id">, place: { country: string; region?: string; city: string; interest: InterestId }): Promise<ICommunity> {
  const found = await Community.findOne({ official: true, country: place.country, city: place.city }).lean<ICommunity>();
  if (found) return found;

  const city = cityName(place.country, place.city);
  try {
    const doc = await Community.create({
      slug: await uniqueCommunitySlug(`Klique ${city}`),
      name: `Klique ${city}`,
      description: `What's on in ${city}: events picked by Klique, and crews to go with. Join to start or join a crew.`,
      interest: place.interest,
      country: place.country,
      region: place.region ?? "",
      city: place.city,
      privacy: "public",
      groupPolicy: "off",
      ownerId: owner._id,
      official: true,
    });
    await Membership.create({ userId: owner._id, communityId: doc._id, subcommunityId: null, role: "owner" });
    await recountMembers(doc._id, null);
    await ensureDefaultChannels(doc._id, owner._id as ICommunity["ownerId"]);
    return doc.toObject();
  } catch (e) {
    // another request created it at the same moment: use theirs
    if ((e as { code?: number })?.code === 11000) {
      const again = await Community.findOne({ official: true, country: place.country, city: place.city }).lean<ICommunity>();
      if (again) return again;
    }
    throw e;
  }
}
