import { readQuery, withApi } from "@/server/http/api";
import { crewMentionable } from "@/server/services/crews.service";
import { memberSearchQuery } from "@/server/validators/schemas";

type P = { id: string };

/** Crew members you can tag with @, matching `?q=`. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => crewMentionable(viewer, params.id, readQuery(req, memberSearchQuery).q));
