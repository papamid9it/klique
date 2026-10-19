import * as Ably from "ably";
import { after } from "next/server";
import type { Types } from "mongoose";
import type { RealtimeEvent, RealtimeTokenDTO } from "@/lib/types";
import { ApiError } from "../http/errors";
import { ablyKey } from "../env";
import { Membership } from "../models/Membership";
import type { IUser } from "../models/User";

/**
 * Realtime = Ably pub/sub. The server publishes a small ping ("something changed in channel X") after a write;
 * open clients receive it instantly and fetch the real content through the normal, permission-checked API.
 * Nothing sensitive travels over Ably. Without ABLY_API_KEY every call here is a quiet no-op.
 */
let rest: Ably.Rest | null | undefined;
const client = () => (rest !== undefined ? rest : (rest = ablyKey() ? new Ably.Rest({ key: ablyKey()! }) : null));

export const rtChannel = {
  user: (id: Types.ObjectId | string) => `user:${String(id)}`,
  community: (id: Types.ObjectId | string) => `community:${String(id)}`,
};

/** Fire-and-forget: never slows or fails the request that caused it. */
export function publish(channels: string[], event: RealtimeEvent) {
  const c = client();
  if (!c || channels.length === 0) return;
  const run = async () => {
    await Promise.all(
      channels.map((name) =>
        c.channels
          .get(name)
          .publish("e", event)
          .catch((err: unknown) => console.warn("[realtime] publish failed:", (err as Error)?.message)),
      ),
    );
  };
  try {
    after(run); // runs once the response is on its way (also keeps serverless functions alive for it)
  } catch {
    void run(); // outside a request (seed scripts, tests)
  }
}

export const emitChannel = (communityId: Types.ObjectId | string, channelId: Types.ObjectId | string) =>
  publish([rtChannel.community(communityId)], { type: "channel", communityId: String(communityId), channelId: String(channelId) });

export const emitTopic = (communityId: Types.ObjectId | string, topicId: Types.ObjectId | string) =>
  publish([rtChannel.community(communityId)], { type: "topic", communityId: String(communityId), topicId: String(topicId) });

export const emitDm = (participants: (Types.ObjectId | string)[], conversationId: Types.ObjectId | string) =>
  publish(
    participants.map((p) => rtChannel.user(p)),
    { type: "dm", conversationId: String(conversationId) },
  );

const MAX_COMMUNITIES = 100;

/** A short-lived, listen-only Ably token limited to this person's own channels. */
export async function realtimeToken(viewer: IUser): Promise<RealtimeTokenDTO> {
  const c = client();
  if (!c) throw new ApiError(503, "Realtime isn't set up on this server (ABLY_API_KEY).", { code: "realtime_not_configured" });
  const mine = await Membership.find({ userId: viewer._id, subcommunityId: null, status: "active" }).select("communityId").limit(MAX_COMMUNITIES).lean<{ communityId: Types.ObjectId }[]>();
  const channels = [rtChannel.user(viewer._id), ...mine.map((m) => rtChannel.community(m.communityId))];
  const capability: Record<string, string[]> = {};
  for (const name of channels) capability[name] = ["subscribe"];
  const tokenRequest = await c.auth.createTokenRequest({ clientId: String(viewer._id), capability: JSON.stringify(capability), ttl: 60 * 60 * 1000 });
  return { tokenRequest: tokenRequest as unknown as Record<string, unknown>, channels };
}
