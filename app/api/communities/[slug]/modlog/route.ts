import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { communityModLog } from "@/server/services/modlog.service";

type P = { slug: string };
const query = z.object({ before: z.string().datetime().optional() });

/** The community's moderation log (owner and admins): removals of other people's content, newest first. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => communityModLog(viewer, params.slug, readQuery(req, query).before));
