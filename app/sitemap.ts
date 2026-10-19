import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { connectDb } from "@/server/db";
import { appUrl } from "@/server/env";
import { Community, type ICommunity } from "@/server/models/Community";
import { Event, type IEvent } from "@/server/models/Event";

/** Public pages search engines may list: upcoming public events and public communities. Built per request from the database. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  await connectDb();
  const base = appUrl();
  const [events, communities] = await Promise.all([
    Event.find({ audience: "public", cancelled: false, startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(5000).select("_id updatedAt").lean<Pick<IEvent, "_id" | "updatedAt">[]>(),
    Community.find({ privacy: "public" }).sort({ memberCount: -1 }).limit(5000).select("slug updatedAt").lean<Pick<ICommunity, "slug" | "updatedAt">[]>(),
  ]);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/events`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/communities`, changeFrequency: "daily", priority: 0.8 },
    ...events.map((e) => ({ url: `${base}/events/${e._id}`, lastModified: e.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...communities.map((c) => ({ url: `${base}/communities/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
