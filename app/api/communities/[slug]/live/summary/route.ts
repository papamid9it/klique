import { withApi } from "@/server/http/api";
import { liveSummary } from "@/server/services/live.service";

/** "How it went": time live, viewers, messages and awards, for the person who streamed. */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => liveSummary(viewer, params.slug, req.nextUrl.searchParams.get("id") ?? ""));
