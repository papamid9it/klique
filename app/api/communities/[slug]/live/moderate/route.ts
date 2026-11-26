import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { moderateLive } from "@/server/services/live.service";

const schema = z.object({ userId: z.string().trim().max(40), action: z.enum(["remove", "allow", "timeout"]) });

/** Moderating the stream from its chat: remove someone from it (or let them back), or time them out for 10 minutes. */
export const POST = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => moderateLive(viewer, params.slug, await readJson(req, schema)));
