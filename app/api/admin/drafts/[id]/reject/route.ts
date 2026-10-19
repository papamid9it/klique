import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { rejectDraft } from "@/server/services/event-import.service";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return rejectDraft(viewer, params.id);
});
