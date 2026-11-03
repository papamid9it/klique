import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { feedCards } from "@/server/services/feed.service";
import { postsWithTag } from "@/server/services/tags.service";

const query = z.object({ page: z.coerce.number().int().min(1).max(100).default(1) });

/** Public posts with this #tag, newest first. */
export const GET = withApi<{ tag: string }>({ auth: "optional" }, async ({ req, params, viewer }) => postsWithTag(viewer, decodeURIComponent(params.tag), readQuery(req, query).page, feedCards));
