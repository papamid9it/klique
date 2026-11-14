import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { listBlocked } from "@/server/services/safety.service";

const query = z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });

/** People you've blocked, newest first. `?limit=` pages it (`?before=` the last one's blockedAt); without it, the first 200 (older apps). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const q = readQuery(req, query);
  return listBlocked(viewer, q.limit ?? 200, q.before);
});
