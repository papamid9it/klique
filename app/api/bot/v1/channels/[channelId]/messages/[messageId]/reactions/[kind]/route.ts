import { REACTIONS } from "@/lib/reactions";
import { badRequest } from "@/server/http/errors";
import { botRoute } from "@/server/http/bot-api";
import { botChannel } from "@/server/services/bots.service";
import { reactToMessage } from "@/server/services/channels.service";

/** React to a message (again to take it back). */
export const PUT = botRoute<{ channelId: string; messageId: string; kind: string }>(async ({ params, bot }) => {
  if (!(REACTIONS as readonly { id: string }[]).some((r) => r.id === params.kind)) throw badRequest("Unknown reaction.");
  const { space, access, channel } = await botChannel(bot, params.channelId);
  return reactToMessage(bot, space, access, channel.slug, params.messageId, params.kind as never);
});
