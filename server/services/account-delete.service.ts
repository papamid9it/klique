import "server-only";
import type { Types } from "mongoose";
import { verifyPassword } from "../auth/password";
import { ApiError, conflict } from "../http/errors";
import { AuthToken } from "../models/AuthToken";
import { ChannelMember, ChannelRead } from "../models/Channel";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Friendship } from "../models/Friendship";
import { Membership, type IMembership } from "../models/Membership";
import { MembershipRequest } from "../models/MembershipRequest";
import { PushToken } from "../models/PushToken";
import { Reaction } from "../models/Reaction";
import { Rsvp, SavedEvent } from "../models/Rsvp";
import { Block } from "../models/Safety";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import { User, type IUser } from "../models/User";
import { WebPushSubscription } from "../models/WebPushSubscription";
import { SavedSticker } from "../models/SavedSticker";
import { purgeEvent } from "./events.service";
import { removeUserFromCrews } from "./crews.service";
import { recountMembers, recountRsvps } from "./helpers";
import { deleteUploads } from "./media.service";

/**
 * "Delete my account". Removes the person and everything that's only theirs: memberships, RSVPs, saves,
 * friendships, blocks, devices, the events they host and their pictures. What they said in shared spaces
 * (chat messages, posts, DMs) stays so conversations still make sense, shown as "Deleted user".
 *
 * Communities they own must be handed over or deleted first, so members are never left without an owner.
 * Groups they own inside someone else's community go to that community's owner.
 */
export async function ownedCommunities(userId: Types.ObjectId) {
  return Community.find({ ownerId: userId }).select("slug name").lean<Pick<ICommunity, "slug" | "name">[]>();
}

export async function deleteAccount(viewer: IUser, input: { password?: string; confirm: string }) {
  const user = await User.findById(viewer._id).select("+passwordHash").lean<IUser>();
  if (!user) throw new ApiError(401, "Please sign in again.");

  if (input.confirm.trim().replace(/^@/, "").toLowerCase() !== user.handle.toLowerCase()) {
    throw new ApiError(422, "Type your handle exactly to confirm.", { errors: { confirm: "That doesn't match your handle." }, code: "validation_failed" });
  }
  if (user.passwordHash && !(await verifyPassword(input.password ?? "", user.passwordHash))) {
    throw new ApiError(422, "That isn't your password.", { errors: { password: "That isn't your password." }, code: "validation_failed" });
  }

  const owned = await ownedCommunities(user._id);
  if (owned.length) {
    throw conflict(`You own ${owned.map((c) => c.name).join(", ")}. Make someone else the owner (Members → Make owner) or delete ${owned.length === 1 ? "it" : "them"} first.`);
  }

  // Groups they run in other people's communities go to that community's owner.
  const groups = await Subcommunity.find({ ownerId: user._id }).select("_id communityId").lean<Pick<ISubcommunity, "_id" | "communityId">[]>();
  for (const g of groups) {
    const parent = await Community.findById(g.communityId).select("ownerId").lean<Pick<ICommunity, "ownerId">>();
    if (!parent) continue;
    await Subcommunity.updateOne({ _id: g._id }, { ownerId: parent.ownerId });
    await Membership.updateOne(
      { userId: parent.ownerId, communityId: g.communityId, subcommunityId: g._id },
      { $set: { role: "owner", status: "active" } },
      { upsert: true },
    );
  }

  await removeUserFromCrews(user._id);
  const hosted = await Event.find({ hostId: user._id }).select("_id coverImage").lean<Pick<IEvent, "_id" | "coverImage">[]>();
  for (const e of hosted) await purgeEvent(e);

  const [memberships, rsvps] = await Promise.all([
    Membership.find({ userId: user._id }).select("communityId subcommunityId").lean<Pick<IMembership, "communityId" | "subcommunityId">[]>(),
    Rsvp.find({ userId: user._id }).select("eventId").lean<{ eventId: Types.ObjectId }[]>(),
  ]);

  await Promise.all([
    Membership.deleteMany({ userId: user._id }),
    MembershipRequest.deleteMany({ userId: user._id }),
    ChannelMember.deleteMany({ userId: user._id }),
    ChannelRead.deleteMany({ userId: user._id }),
    Rsvp.deleteMany({ userId: user._id }),
    SavedEvent.deleteMany({ userId: user._id }),
    SavedSticker.deleteMany({ userId: user._id }),
    Friendship.deleteMany({ $or: [{ requesterId: user._id }, { recipientId: user._id }] }),
    Block.deleteMany({ $or: [{ blockerId: user._id }, { blockedId: user._id }] }),
    Reaction.deleteMany({ userId: user._id }),
    PushToken.deleteMany({ userId: user._id }),
    WebPushSubscription.deleteMany({ userId: user._id }),
    AuthToken.deleteMany({ userId: user._id }),
  ]);

  const spaces = new Map(memberships.map((m) => [`${m.communityId}:${m.subcommunityId ?? ""}`, m]));
  await Promise.all([...spaces.values()].map((m) => recountMembers(m.communityId, m.subcommunityId ?? null)));
  await Promise.all([...new Set(rsvps.map((r) => String(r.eventId)))].map((id) => recountRsvps(rsvps.find((r) => String(r.eventId) === id)!.eventId)));

  await User.deleteOne({ _id: user._id });
  deleteUploads([user.avatarUrl, user.bannerUrl]);
  return { deleted: true };
}
