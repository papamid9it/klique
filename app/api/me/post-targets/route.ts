import { withApi } from "@/server/http/api";
import { postTargets } from "@/server/services/feed.service";

/** The communities you can post to right now. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => postTargets(viewer));
