import { withApi } from "@/server/http/api";
import { getRanksConfig } from "@/server/services/hype.service";

/** Rank names, the Hype each needs, the points each pays, and what earns Hype (for badges and the Points page). */
export const GET = withApi({ auth: "optional" }, async () => getRanksConfig());
