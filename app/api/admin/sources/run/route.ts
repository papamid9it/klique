import { created, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { checkSourcesNow } from "@/server/services/event-import.service";

/** "Check now": a finder job over every saved page (the page then works through it a step at a time). */
export const POST = withApi({ auth: "required", limit: { name: "admin-run-sources", max: 5, windowMs: 60_000 } }, async ({ viewer }) => {
  assertAdmin(viewer);
  return created(await checkSourcesNow(viewer));
});
