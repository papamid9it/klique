import "server-only";
import { Types } from "mongoose";
import type { TypingDTO, TypingTarget } from "@/lib/types";
import { notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Conversation, type IConversation } from "../models/Conversation";
import type { IUser } from "../models/User";
import { typingChannel } from "./channels.service";
import { typingCrew } from "./crews.service";
import { sid } from "./helpers";
import { publish, rtChannel } from "./realtime";
import { resolveSpaceFor } from "./spaces.service";

/**
 * "X is typing…": who's typing where, for a few seconds after each sign of it. Browsers send one every few seconds
 * while someone types, and one when they stop (sent, cleared, left). With Ably the others hear it at once; without
 * it they ask (GET) every few seconds. Kept in this server's memory only: it's gone in seconds anyway, and with
 * several servers and no Ably a typer on another one simply isn't shown.
 */
const TTL = 6_000;
const live = new Map<string, Map<string, { name: string; until: number }>>();

function sweep(where: string) {
  const m = live.get(where);
  if (!m) return null;
  const now = Date.now();
  for (const [id, t] of m) if (t.until < now) m.delete(id);
  if (!m.size) live.delete(where);
  return live.get(where) ?? null;
}

/** Where a chat's typing lives, after checking the person may post in it, and who should hear about it. */
async function resolve(viewer: IUser, t: TypingTarget): Promise<{ where: string; channels: string[] }> {
  if (t.kind === "channel") {
    const { space, access } = await resolveSpaceFor(viewer, t.slug, t.sub ?? undefined);
    const channel = await typingChannel(viewer, space, access, t.channel);
    return { where: `ch:${sid(channel._id)}`, channels: [rtChannel.community(space.community._id)] };
  }
  if (t.kind === "dm") {
    if (!Types.ObjectId.isValid(t.id)) throw notFound("We couldn't find that conversation.");
    const c = await Conversation.findOne({ _id: t.id, participants: viewer._id }).select("participants").lean<Pick<IConversation, "participants">>();
    if (!c) throw notFound("We couldn't find that conversation.");
    return { where: `dm:${t.id}`, channels: c.participants.map((p) => rtChannel.user(p)) };
  }
  const crew = await typingCrew(viewer, t.id);
  return { where: `crew:${sid(crew.id)}`, channels: crew.members.map((m) => rtChannel.user(m)) };
}

const others = (where: string, viewer: IUser): TypingDTO => ({
  where,
  typing: [...(sweep(where) ?? new Map()).entries()].filter(([id]) => id !== sid(viewer._id)).map(([id, t]) => ({ id, name: t.name })),
});

/** Who else is typing in this chat. */
export async function whoIsTyping(viewer: IUser, t: TypingTarget): Promise<TypingDTO> {
  return others((await resolve(viewer, t)).where, viewer);
}

/** They're typing (`on`), or stopped. The others hear it live when Ably is set up. */
export async function setTyping(viewer: IUser, t: TypingTarget, on: boolean): Promise<TypingDTO> {
  rateLimit(`typing:${sid(viewer._id)}`, 60, 60_000);
  const { where, channels } = await resolve(viewer, t);
  const me = sid(viewer._id);
  const m = sweep(where) ?? new Map<string, { name: string; until: number }>();
  const was = m.has(me);
  if (on) m.set(me, { name: viewer.displayName, until: Date.now() + TTL });
  else m.delete(me);
  if (m.size) live.set(where, m);
  else live.delete(where);
  // a ping when it starts and every few seconds while it lasts (the browser throttles), and one when it stops
  if (on || was) publish(channels, { type: "typing", where, user: { id: me, name: viewer.displayName }, on });
  return others(where, viewer);
}
