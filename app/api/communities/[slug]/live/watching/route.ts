import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { leftStream, watching } from "@/server/services/live.service";

const schema = z.object({ liveId: z.string().trim().max(40), key: z.string().trim().max(64).optional() });

/** The player's "still watching" (every 20 seconds): counts viewers, answers how many are on now. */
export const POST = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => watching(viewer, params.slug, await readJson(req, schema)));

/** The player closed: off the viewer count at once. */
export const DELETE = withApi<{ slug: string }, "optional">({ auth: "optional" }, async ({ req, viewer }) => leftStream(viewer, { liveId: req.nextUrl.searchParams.get("liveId") ?? "", key: req.nextUrl.searchParams.get("key") ?? undefined }));
