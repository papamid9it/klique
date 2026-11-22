import { withApi } from "@/server/http/api";
import { communityReview } from "@/server/services/review.service";

type P = { slug: string };

/** "To review": members' events waiting for approval, 20 at a time (`after`: the last one shown), and how many join requests are waiting. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => communityReview(viewer, params.slug, new URL(req.url).searchParams.get("after")));
