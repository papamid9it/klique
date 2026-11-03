import { withApi } from "@/server/http/api";
import { communityBots } from "@/server/services/bots.service";

/** The bots in this community. */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => communityBots(viewer, params.slug));
