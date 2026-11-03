import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { setSuppressEveryone } from "@/server/services/communities.service";

/** Your notification settings in this community: "Suppress @everyone and @here". */
export const PUT = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setSuppressEveryone(viewer, params.slug, (await readJson(req, z.object({ suppressEveryone: z.boolean() }))).suppressEveryone));
