import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { bulkDrafts } from "@/server/services/event-import.service";
import { draftBulkSchema } from "@/server/validators/schemas";

/** Post many drafts (to Klique, or a chosen community) or reject many. Rejected ones never come back. */
export const maxDuration = 60;

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { ids, action, communitySlug, subSlug } = await readJson(req, draftBulkSchema);
  const out = await bulkDrafts(viewer, ids, action, { communitySlug, subSlug });
  await logAction(viewer, action === "approve" ? "draft.approve" : "draft.reject", "event", null, `${out.done.length} drafts${communitySlug ? ` to ${communitySlug}` : ""}`, "", "/admin/inbox");
  return out;
});
