import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { listSearches, saveSearch } from "@/server/services/event-import.service";
import { savedSearchSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return listSearches();
});

/** Save a search to re-run every night (finds only go to the review queue). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return created(await saveSearch(viewer, await readJson(req, savedSearchSchema)));
});
