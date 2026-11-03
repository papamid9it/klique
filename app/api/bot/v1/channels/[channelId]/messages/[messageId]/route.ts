import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botChannel } from "@/server/services/bots.service";
import { deleteMessage, editMessage } from "@/server/services/channels.service";

type P = { channelId: string; messageId: string };
const body = z.object({ content: z.string().trim().min(1).max(2000) });

/** Edit one of the bot's own messages. */
export const PATCH = botRoute<P>(async ({ req, params, bot }) => {
  const { content } = await botJson(req, body);
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return editMessage(bot, space, access, channel.slug, params.messageId, content);
});

/** Delete a message: its own, or anyone's below it with "Delete messages". */
export const DELETE = botRoute<P>(async ({ params, bot }) => {
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return deleteMessage(bot, space, access, channel.slug, params.messageId);
});
