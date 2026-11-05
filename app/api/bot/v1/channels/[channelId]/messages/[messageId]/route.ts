import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botChannel } from "@/server/services/bots.service";
import { cardsSchema } from "@/server/services/cards";
import { deleteMessage, editMessage } from "@/server/services/channels.service";

type P = { channelId: string; messageId: string };
const body = z.object({ content: z.string().trim().max(2000).optional(), cards: cardsSchema.optional() }).refine((m) => m.content !== undefined || m.cards !== undefined, "Send `content`, `cards` or both.");

/** Edit one of the bot's own messages: leave out `content` or `cards` to keep them, or send `cards: []` to take them off. */
export const PATCH = botRoute<P>(async ({ req, params, bot }) => {
  const { content, cards } = await botJson(req, body);
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return editMessage(bot, space, access, channel.slug, params.messageId, content, cards);
});

/** Delete a message: its own, or anyone's below it with "Delete messages". */
export const DELETE = botRoute<P>(async ({ params, bot }) => {
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return deleteMessage(bot, space, access, channel.slug, params.messageId);
});
