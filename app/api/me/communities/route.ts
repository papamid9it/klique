import { withApi } from "@/server/http/api";
import { myCommunities } from "@/server/services/rail.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => myCommunities(viewer));
