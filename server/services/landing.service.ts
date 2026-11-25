import "server-only";
import { cacheLife } from "next/cache";
import type { EventDTO } from "@/lib/types";
import { connectDb } from "../db";
import { Community } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { notAdult } from "../policies/adult";
import { listedFilter } from "../policies/standing";
import { toEvents } from "../serializers";

/**
 * The landing page's "Coming up": the next public events anyone could go to (public communities, not 18+, approved,
 * not cancelled), soonest first. Kept an hour, so a visitor costs nothing; signed-out view (no RSVPs, no friends).
 */
export async function upcomingForLanding(limit = 4): Promise<EventDTO[]> {
  "use cache";
  cacheLife("hours");
  await connectDb();
  const open = await Community.find({ privacy: "public", ...notAdult }).distinct("_id");
  const rows = await Event.find({ audience: "public", cancelled: false, startsAt: { $gte: new Date() }, review: null, $or: [{ communityId: null }, { communityId: { $in: open } }] })
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean<IEvent[]>();
  return toEvents(rows, null);
}

export type LandingCommunity = { slug: string; name: string; line: string; cover: string | null; members: number };

/**
 * The landing page's communities: the biggest public ones anyone can join (not 18+, not Klique's own), with a
 * picture first. Kept an hour.
 */
export async function communitiesForLanding(limit = 5): Promise<LandingCommunity[]> {
  "use cache";
  cacheLife("hours");
  await connectDb();
  const { KLIQUE_SLUG } = await import("@/lib/constants");
  const rows = await Community.find({ privacy: "public", ...notAdult, explicit: { $ne: true }, official: { $ne: true }, slug: { $ne: KLIQUE_SLUG }, ...listedFilter() })
    .sort({ coverImage: -1, memberCount: -1 })
    .limit(limit)
    .select("slug name description interest city memberCount coverImage")
    .lean<{ slug: string; name: string; description?: string; interest?: string; city?: string; memberCount?: number; coverImage?: string | null }[]>();
  const { getInterest } = await import("@/lib/constants");
  const { placeLabel } = await import("@/lib/places");
  return rows.map((c) => ({
    slug: c.slug,
    name: c.name,
    line: [getInterest(c.interest ?? "")?.name, c.city ? placeLabel({ city: c.city } as never) : ""].filter(Boolean).join(" · "),
    cover: c.coverImage ? c.coverImage.split("#")[0] : null,
    members: c.memberCount ?? 0,
  }));
}
