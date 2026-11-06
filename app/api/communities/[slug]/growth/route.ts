import { withApi } from "@/server/http/api";
import { communityGrowth } from "@/server/services/growth.service";

/** How the community is doing, by its owner's plan (its owner and admins). */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => communityGrowth(viewer, params.slug));
