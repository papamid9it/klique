import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { approveDraft } from "@/server/services/event-import.service";
import { adminDraftPatchSchema } from "@/server/validators/schemas";

/** Publish the draft (with any last edits) as a real public event. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { communitySlug, subSlug, ...patch } = await readJson(req, adminDraftPatchSchema);
  const out = await approveDraft(viewer, params.id, patch, { communitySlug, subSlug });
  await logAction(viewer, "draft.approve", "event", out.eventId, out.title, "", `/events/${out.eventId}`);
  return out;
});
