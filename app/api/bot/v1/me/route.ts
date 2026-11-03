import { Community } from "@/server/models/Community";
import { botRoute } from "@/server/http/bot-api";

/** The bot itself, and the communities it's in. */
export const GET = botRoute(async ({ app, bot }) => {
  const communities = await Community.find({ bots: app._id }).select("slug name").lean<{ _id: unknown; slug: string; name: string }[]>();
  return { id: String(app._id), user: { id: String(bot._id), handle: bot.handle, name: bot.displayName }, name: app.name, commands: app.commands, communities: communities.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name })) };
});
