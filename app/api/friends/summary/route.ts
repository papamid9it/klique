import { withApi } from "@/server/http/api";
import { friendsSummary } from "@/server/services/friends.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => friendsSummary(viewer));
