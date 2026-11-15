import { readJson, withApi } from "@/server/http/api";
import { deleteCrewMessages } from "@/server/services/crews.service";
import { bulkDeleteSchema } from "@/server/validators/schemas";

/** Select mode: delete several messages at once (yours; the host can remove anyone's). */
export const POST = withApi<{ id: string }, "required">({ auth: "required", limit: { name: "crew-bulk-delete", max: 20, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const { ids } = await readJson(req, bulkDeleteSchema);
  return deleteCrewMessages(viewer, params.id, ids);
});
