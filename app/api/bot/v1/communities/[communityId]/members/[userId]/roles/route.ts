import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botIn } from "@/server/services/bots.service";
import { setMemberRoles } from "@/server/services/roles.service";

const body = z.object({ roleIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50) });

/** Set someone's roles (needs "Manage roles"; only roles below the bot's, for people below it). */
export const PUT = botRoute<{ communityId: string; userId: string }>(async ({ req, params, bot }) => {
  const { roleIds } = await botJson(req, body);
  const { space } = await botIn(bot, params.communityId);
  return setMemberRoles(bot, space.community.slug, params.userId, roleIds);
});
