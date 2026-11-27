import { Community } from "@/server/models/Community";
import { CommunityRole } from "@/server/models/CommunityRole";
import { botRoute } from "@/server/http/bot-api";

/** The bot itself, and the communities it's in (with whether each lets it read messages and post events). */
export const GET = botRoute(async ({ app, bot }) => {
  const communities = await Community.find({ bots: app._id }).select("slug name").lean<{ _id: unknown; slug: string; name: string }[]>();
  const roles = await CommunityRole.find({ botAppId: app._id }).select("communityId readMessagesSince postEvents").lean<{ communityId: unknown; readMessagesSince?: Date | null; postEvents?: boolean }[]>();
  const can = new Set(roles.filter((r) => r.readMessagesSince).map((r) => String(r.communityId)));
  const posts = new Set(roles.filter((r) => r.postEvents).map((r) => String(r.communityId)));
  return { id: String(app._id), user: { id: String(bot._id), handle: bot.handle, name: bot.displayName }, name: app.name, commands: app.commands, communities: communities.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name, readMessages: can.has(String(c._id)), postEvents: posts.has(String(c._id)) })) };
});
