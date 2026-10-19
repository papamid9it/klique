import { withApi } from "@/server/http/api";
import { recordClick } from "@/server/services/ads.service";

/** Counts a click on an ad (the link itself opens normally). */
export const POST = withApi<{ id: string }, "none">({ auth: "none", limit: { name: "ad-click", max: 60, windowMs: 60_000 } }, async ({ params }) => recordClick(params.id));
