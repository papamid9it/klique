import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { setCommunityMuted } from "@/server/services/communities.service";

const body = z.object({ muted: z.boolean() });

/** Your own mute for this community. */
export const PUT = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setCommunityMuted(viewer, params.slug, (await readJson(req, body)).muted));
