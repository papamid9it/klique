import { withApi } from "@/server/http/api";
import { realtimeToken } from "@/server/services/realtime";

/** Listen-only Ably token for the signed-in person. 503 when realtime isn't configured: clients then just poll. */
export const GET = withApi({ auth: "required", limit: { name: "rt-token", max: 60, windowMs: 10 * 60_000 } }, async ({ viewer }) => realtimeToken(viewer));
