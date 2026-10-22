import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { recentRuns, startSearch } from "@/server/services/event-import.service";
import { finderSearchSchema } from "@/server/validators/schemas";

/** The last few finder searches (to pick up one still running). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return recentRuns();
});

/** "Find events": records the job; the admin page then asks for its steps. Nothing is fetched here. */
export const POST = withApi({ auth: "required", limit: { name: "admin-finder", max: 20, windowMs: 60_000 } }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const run = await startSearch(viewer, await readJson(req, finderSearchSchema));
  await logAction(viewer, "finder.search", "event", run.id, [run.query.city, run.query.country].filter(Boolean).join(", ") || "links", "", "/admin/inbox");
  return created(run);
});
