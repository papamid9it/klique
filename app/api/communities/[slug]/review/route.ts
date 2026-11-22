import { withApi } from "@/server/http/api";
import { communityReview } from "@/server/services/review.service";

type P = { slug: string };

/** "To review": members' events waiting for approval, and how many join requests are waiting. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => communityReview(viewer, params.slug));
