import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { removeSearch, updateSearch } from "@/server/services/event-import.service";
import { savedSearchPatchSchema } from "@/server/validators/schemas";

type P = { id: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  return updateSearch(params.id, await readJson(req, savedSearchPatchSchema));
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return removeSearch(params.id);
});
