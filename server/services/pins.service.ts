import "server-only";
import { Types } from "mongoose";
import { LIMITS } from "@/lib/constants";
import { badRequest, conflict, notFound } from "../http/errors";
import { Conversation } from "../models/Conversation";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";

/** Pin a chat or a community to the top of your own lists (it follows your account to every device). */
export async function setPin(viewer: IUser, input: { kind: "chat" | "community"; id: string; on: boolean }) {
  if (!Types.ObjectId.isValid(input.id)) throw badRequest("That isn't something you can pin.");
  const id = new Types.ObjectId(input.id);
  const field = input.kind === "chat" ? "pins.chats" : "pins.communities";
  if (!input.on) {
    await User.updateOne({ _id: viewer._id }, { $pull: { [field]: id } });
    return { ...input, on: false };
  }
  const mine = input.kind === "chat" ? await Conversation.exists({ _id: id, participants: viewer._id }) : await Membership.exists({ userId: viewer._id, communityId: id, subcommunityId: null, status: "active" });
  if (!mine) throw notFound(input.kind === "chat" ? "We couldn't find that chat." : "Join this community to pin it.");
  const now = input.kind === "chat" ? viewer.pins?.chats : viewer.pins?.communities;
  const max = input.kind === "chat" ? LIMITS.pinnedChats : LIMITS.pinnedCommunities;
  if ((now?.length ?? 0) >= max && !now?.some((x) => String(x) === input.id)) throw conflict(`You can pin ${max} ${input.kind === "chat" ? "chats" : "communities"}. Unpin one first.`);
  await User.updateOne({ _id: viewer._id }, { $addToSet: { [field]: id } });
  return { ...input, on: true };
}
