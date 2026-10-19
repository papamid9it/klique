import { withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { rejectDraft } from "@/server/services/event-import.service";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  const out = await rejectDraft(viewer, params.id);
  await logAction(viewer, "draft.reject", "draft", params.id, out.title);
  return { rejected: true };
});
