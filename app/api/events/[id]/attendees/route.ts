import { withApi } from "@/server/http/api";
import { getAttendees } from "@/server/services/events.service";

export const GET = withApi<{ id: string }, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => getAttendees(viewer, params.id, new URL(req.url).searchParams.get("after")));
