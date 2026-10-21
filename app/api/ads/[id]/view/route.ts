import { withApi } from "@/server/http/api";
import { recordView } from "@/server/services/ads.service";

/** Counts a view of an ad, sent once it's actually on screen. */
export const POST = withApi<{ id: string }, "none">({ auth: "none", limit: { name: "ad-view", max: 240, windowMs: 60_000 } }, async ({ params }) => recordView(params.id));
