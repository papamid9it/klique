import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { stepSearch } from "@/server/services/event-import.service";

/** Work on a search for about 12 seconds (one source at a time, 8s cap per fetch), then report progress. */
// an AI web search (finder/ai) can take a minute or two in one step
export const maxDuration = 150;

export const POST = withApi<{ id: string }, "required">({ auth: "required", limit: { name: "admin-finder-step", max: 60, windowMs: 60_000 } }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return stepSearch(params.id);
});
