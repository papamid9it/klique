import { withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { removeSource } from "@/server/services/event-import.service";

export const DELETE = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  const s = await removeSource(params.id);
  if (s) await logAction(viewer, "source.remove", "source", params.id, s.name, s.url);
  return { removed: true };
});
