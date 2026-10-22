import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { getRun } from "@/server/services/event-import.service";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return getRun(params.id);
});
