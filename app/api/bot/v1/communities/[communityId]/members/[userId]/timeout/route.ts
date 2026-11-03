import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { botIn } from "@/server/services/bots.service";
import { setTimeout_ } from "@/server/services/spaces.service";

const body = z.object({ seconds: z.number().int().min(0).max(604_800), reason: z.string().trim().max(300).default("") });

/** Time someone out (or seconds: 0 to lift it): needs "Time out members", and only below the bot. */
export const POST = botRoute<{ communityId: string; userId: string }>(async ({ req, params, bot }) => {
  const { seconds, reason } = await botJson(req, body);
  const { space, access } = await botIn(bot, params.communityId);
  return setTimeout_(bot, space, access, params.userId, seconds, reason);
});
