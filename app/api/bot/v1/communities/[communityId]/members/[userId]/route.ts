import { botRoute } from "@/server/http/bot-api";
import { botIn } from "@/server/services/bots.service";
import { removeMember } from "@/server/services/spaces.service";

/** Remove someone (?ban=1 to ban): needs "Remove members" / "Ban members", and only below the bot. */
export const DELETE = botRoute<{ communityId: string; userId: string }>(async ({ req, params, bot }) => {
  const ban = new URL(req.url).searchParams.get("ban") === "1";
  const { space, access } = await botIn(bot, params.communityId);
  return removeMember(bot, space, access, params.userId, ban);
});
