import { withApi } from "@/server/http/api";
import { myCommunityCrews } from "@/server/services/crews.service";

type P = { slug: string };

/** The crews you're in (or asked to join) for this community's events, for its left panel. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => myCommunityCrews(viewer, params.slug));
