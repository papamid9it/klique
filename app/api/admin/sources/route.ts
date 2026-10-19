import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { addSource, listSources } from "@/server/services/event-import.service";
import { adminSourceSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return listSources();
});

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { url, name } = await readJson(req, adminSourceSchema);
  const s = await addSource(url, name);
  await logAction(viewer, "source.add", "source", s.id, s.name, s.url);
  return created(s);
});
