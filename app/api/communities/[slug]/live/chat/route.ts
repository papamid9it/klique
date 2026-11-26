import { withApi } from "@/server/http/api";
import { liveChat } from "@/server/services/live.service";

/** The chat beside the community's live stream (members chat; anyone who can see the community reads along). */
export const GET = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ params, viewer }) => liveChat(viewer, params.slug));
