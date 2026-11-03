import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botChannel } from "@/server/services/bots.service";
import { postMessage } from "@/server/services/channels.service";

const body = z.object({ content: z.string().trim().min(1).max(2000), reply_to: z.string().regex(/^[a-f0-9]{24}$/i).optional() });

/** Post a message in a channel (or thread). */
export const POST = botRoute<{ channelId: string }>(async ({ req, params, bot }) => {
  const { content, reply_to } = await botJson(req, body);
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return postMessage(bot, space, access, channel.slug, { body: content, replyToId: reply_to });
});
