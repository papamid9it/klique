import { readQuery, withApi } from "@/server/http/api";
import { profileEvents } from "@/server/services/users.service";
import { profileEventsQuery } from "@/server/validators/schemas";

/** "See all" on a profile: the events they're going to or hosting. */
export const GET = withApi<{ handle: string }, "optional">({ auth: "optional" }, async ({ req, params, viewer }) => profileEvents(viewer, params.handle, readQuery(req, profileEventsQuery).kind));
