import { readJson, withApi } from "@/server/http/api";
import { deleteMessages } from "@/server/services/messaging.service";
import { bulkDeleteSchema } from "@/server/validators/schemas";

/** Select mode: delete several of your messages at once. */
export const POST = withApi<{ id: string }, "required">({ auth: "required", limit: { name: "dm-bulk-delete", max: 20, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const { ids } = await readJson(req, bulkDeleteSchema);
  return deleteMessages(viewer, params.id, ids);
});
