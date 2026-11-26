import { withApi } from "@/server/http/api";
import { liveNow } from "@/server/services/live.service";

/** "Live now" on Home: streams on right now in your communities. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => liveNow(viewer));
