import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { importFromUrl, listDrafts } from "@/server/services/event-import.service";
import { adminDraftsQuery, adminImportSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return listDrafts(readQuery(req, adminDraftsQuery).status);
});

/** Paste a link: whatever events it holds land in the inbox as pending drafts. */
export const POST = withApi({ auth: "required", limit: { name: "admin-import", max: 30, windowMs: 60_000 } }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { url } = await readJson(req, adminImportSchema);
  return created(await importFromUrl(viewer, url));
});
