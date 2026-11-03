import { botRoute } from "@/server/http/bot-api";
import { botIn } from "@/server/services/bots.service";
import { listChannels } from "@/server/services/channels.service";

/** The channels the bot can see in a community. */
export const GET = botRoute<{ communityId: string }>(async ({ params, bot }) => {
  const { space, access } = await botIn(bot, params.communityId);
  const list = await listChannels(bot, space, access);
  return list.channels.map((c) => ({ id: c.id, slug: c.slug, name: c.name, type: c.type, canPost: c.canPost }));
});
