import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { runSources } from "@/server/services/event-import.service";

/** "Check now": run the nightly finder over every source page. */
export const POST = withApi({ auth: "required", limit: { name: "admin-run-sources", max: 5, windowMs: 60_000 } }, async ({ viewer }) => {
  assertAdmin(viewer);
  return runSources();
});
