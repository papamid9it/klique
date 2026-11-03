import { withApi } from "@/server/http/api";
import { trendingTags } from "@/server/services/tags.service";

/** The #tags most used in public posts lately. */
export const GET = withApi({ auth: "optional" }, async () => trendingTags(12));
