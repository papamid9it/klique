import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { addSource, listSources } from "@/server/services/event-import.service";
import { adminSourceSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return listSources();
});

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { url, name } = await readJson(req, adminSourceSchema);
  return created(await addSource(url, name));
});
