import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { removeSource } from "@/server/services/event-import.service";

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return removeSource(params.id);
});
