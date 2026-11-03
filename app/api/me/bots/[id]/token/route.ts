import { withApi } from "@/server/http/api";
import { regenerateBotToken } from "@/server/services/bots.service";

/** A new token for the bot (the old one stops working). */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => regenerateBotToken(viewer, params.id));
