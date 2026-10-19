import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { updateDraft } from "@/server/services/event-import.service";
import { adminDraftPatchSchema } from "@/server/validators/schemas";

export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return updateDraft(params.id, await readJson(req, adminDraftPatchSchema));
});
