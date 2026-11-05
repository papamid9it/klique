import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botChannel, botReadMessages } from "@/server/services/bots.service";
import { cardsSchema } from "@/server/services/cards";
import { postMessage } from "@/server/services/channels.service";

const body = z
  .object({ content: z.string().trim().max(2000).optional(), cards: cardsSchema.optional(), reply_to: z.string().regex(/^[a-f0-9]{24}$/i).optional() })
  .refine((m) => !!m.content || !!m.cards?.length, "Send `content`, `cards` or both.");

/** Read a channel, if the community lets this bot read messages: only what was said since it allowed it. */
export const GET = botRoute<{ channelId: string }>(async ({ req, params, app, bot }) => botReadMessages(app, bot, params.channelId, Object.fromEntries(new URL(req.url).searchParams)));

/** Post a message in a channel (or thread): words, cards or both. */
export const POST = botRoute<{ channelId: string }>(async ({ req, params, bot }) => {
  const { content, cards, reply_to } = await botJson(req, body);
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return postMessage(bot, space, access, channel.slug, { body: content ?? "", cards, replyToId: reply_to });
});
