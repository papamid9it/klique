import { withApi } from "@/server/http/api";
import { communityDashboard } from "@/server/services/dashboard.service";

type P = { slug: string };

/** The owner's dashboard: members and growth, what's waiting for approval, this week's activity. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => communityDashboard(viewer, params.slug));
