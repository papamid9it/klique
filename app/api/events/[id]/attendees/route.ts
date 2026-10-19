import { withApi } from "@/server/http/api";
import { getAttendees } from "@/server/services/events.service";

export const GET = withApi<{ id: string }, "optional">({ auth: "optional" }, async ({ params, viewer }) => getAttendees(viewer, params.id));
