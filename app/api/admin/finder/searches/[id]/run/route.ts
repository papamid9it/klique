import { created, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { runSearchNow } from "@/server/services/event-import.service";

/** Run a saved search now (the page then works through it a step at a time). */
export const POST = withApi<{ id: string }, "required">({ auth: "required", limit: { name: "admin-finder", max: 20, windowMs: 60_000 } }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return created(await runSearchNow(viewer, params.id));
});
