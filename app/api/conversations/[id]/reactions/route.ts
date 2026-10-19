import { readQuery, withApi } from "@/server/http/api";
import { reactionsFor } from "@/server/services/messaging.service";
import { reactionIdsQuery } from "@/server/validators/schemas";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { ids } = readQuery(req, reactionIdsQuery);
  return reactionsFor(viewer, params.id, ids);
});
