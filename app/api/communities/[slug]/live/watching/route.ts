import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { leftStream, recentJoins, watching } from "@/server/services/live.service";

const schema = z.object({ liveId: z.string().trim().max(40), key: z.string().trim().max(64).optional(), first: z.boolean().optional() });

/** The player's "still watching" (every 20 seconds): counts viewers, answers how many are on now. */
export const POST = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => watching(viewer, params.slug, await readJson(req, schema)));

/** Who came in lately (`?liveId=&after=`): for a stream screen without the live connection. */
export const GET = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => recentJoins(viewer, params.slug, req.nextUrl.searchParams.get("liveId") ?? "", req.nextUrl.searchParams.get("after")));

/** The player closed: off the viewer count at once. */
export const DELETE = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ req, viewer }) => leftStream(viewer, { liveId: req.nextUrl.searchParams.get("liveId") ?? "", key: req.nextUrl.searchParams.get("key") ?? undefined }));
