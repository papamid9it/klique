import { Board, Topic, TopicComment, TopicLike, type ITopic } from "../models/Topic";
import { deleteUploads } from "./media.service";
import { ApiError } from "../http/errors";
import { validatePlace } from "@/lib/places";
import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { Channel, ChannelCategory, ChannelMember, ChannelMessage, ChannelRead } from "../models/Channel";
import { Community } from "../models/Community";
import { Event } from "../models/Event";
import { Invitation } from "../models/Invitation";
import { Membership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import { Post } from "../models/Post";
import { Rsvp, SavedEvent } from "../models/Rsvp";
import { Subcommunity } from "../models/Subcommunity";

export const sid = (id: Types.ObjectId | string) => String(id);

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: "Alté" -> "Alte"
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "klique";
}

/** Unique community slug: "lagos-skate", then "lagos-skate-2", … */
export async function uniqueCommunitySlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await Community.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export async function uniqueSubSlug(communityId: Types.ObjectId, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await Subcommunity.exists({ communityId, slug: candidate }))) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** URL-safe 12-char invite code (72 bits of entropy — unguessable). */
export const newInviteCode = () => randomBytes(9).toString("base64url");

/**
 * Counters are always recomputed from source rows (never incremented), so they
 * self-heal and cannot drift after crashes or concurrent requests.
 */
export async function recountMembers(communityId: Types.ObjectId, subcommunityId: Types.ObjectId | null) {
  const count = await Membership.countDocuments({ communityId, subcommunityId, status: "active" });
  if (subcommunityId) await Subcommunity.updateOne({ _id: subcommunityId }, { memberCount: count });
  else await Community.updateOne({ _id: communityId }, { memberCount: count });
  return count;
}

export async function recountRsvps(eventId: Types.ObjectId) {
  const [going, interested] = await Promise.all([
    Rsvp.countDocuments({ eventId, status: "going" }),
    Rsvp.countDocuments({ eventId, status: "interested" }),
  ]);
  await Event.updateOne({ _id: eventId }, { goingCount: going, interestedCount: interested });
  return { going, interested };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const PAGE_SIZE = 12;

/** Remove everything that lives in one space (memberships, requests, invites, posts, events + their RSVPs/saves). */
/** The uploaded files a topic points at (its media, their video posters, and the old single-image field). */
export const topicFileUrls = (t: Pick<ITopic, "imageUrl" | "media">): (string | null | undefined)[] => [t.imageUrl, ...(t.media ?? []).flatMap((m) => [m.url, m.poster])];

export async function purgeSpaceData(communityId: Types.ObjectId, subcommunityId: Types.ObjectId | null) {
  const where = { communityId, subcommunityId };
  const events = await Event.find(where).select("_id coverImage").lean<{ _id: Types.ObjectId; coverImage?: string | null }[]>();
  const eventIds = events.map((e) => e._id);
  // Chat: this space's channels (a community's purge also covers its categories).
  const channels = await Channel.find(where).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const channelIds = channels.map((c) => c._id);

  // Every uploaded file in this space goes from storage too: chat photos/videos, topic media, update photos, event covers.
  const [msgFiles, postFiles, topicFiles] = await Promise.all([
    channelIds.length ? ChannelMessage.find({ channelId: { $in: channelIds }, "images.0": { $exists: true } }).select("images").lean<{ images: string[] }[]>() : [],
    Post.find({ ...where, imageUrl: { $ne: null } }).select("imageUrl").lean<{ imageUrl: string | null }[]>(),
    subcommunityId === null ? Topic.find({ communityId }).select("imageUrl media").lean<Pick<ITopic, "imageUrl" | "media">[]>() : [],
  ]);
  deleteUploads([
    ...msgFiles.flatMap((m) => m.images),
    ...postFiles.map((p) => p.imageUrl),
    ...topicFiles.flatMap(topicFileUrls),
    ...events.map((e) => e.coverImage),
  ]);

  if (channelIds.length) {
    await Promise.all([
      ChannelMessage.deleteMany({ channelId: { $in: channelIds } }),
      ChannelRead.deleteMany({ channelId: { $in: channelIds } }),
      ChannelMember.deleteMany({ channelId: { $in: channelIds } }),
      Channel.deleteMany({ _id: { $in: channelIds } }),
    ]);
  }
  if (subcommunityId === null) {
    await ChannelCategory.deleteMany({ communityId });
    await Board.deleteMany({ communityId });
    const topicIds = await Topic.find({ communityId }).distinct("_id");
    await Promise.all([TopicLike.deleteMany({ topicId: { $in: topicIds } }), TopicComment.deleteMany({ communityId }), Topic.deleteMany({ communityId })]);
  }
  await Promise.all([
    Membership.deleteMany(where),
    MembershipRequest.deleteMany(where),
    Invitation.deleteMany(where),
    Post.deleteMany(where),
    Event.deleteMany(where),
    eventIds.length ? Rsvp.deleteMany({ eventId: { $in: eventIds } }) : null,
    eventIds.length ? SavedEvent.deleteMany({ eventId: { $in: eventIds } }) : null,
  ]);
}

/**
 * Reject a country / state / city combination the app doesn't know. Cities may be any town;
 * only the country and (where we list them) the state have to be real.
 */
export function assertPlace(p: { country?: string; region?: string; city?: string }, requireAll: boolean): void {
  if (!requireAll && p.country === undefined && p.region === undefined && p.city === undefined) return;
  const country = p.country;
  if (!country) throw new ApiError(422, "Pick a country.", { errors: { country: "Pick a country" } });
  const err = validatePlace({ country, region: p.region ?? "", city: p.city ?? "x" });
  if (err) throw new ApiError(422, err, { errors: { city: err } });
}
