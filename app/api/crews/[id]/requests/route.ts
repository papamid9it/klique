import { readJson, withApi } from "@/server/http/api";
import { decideAll } from "@/server/services/crews.service";
import { crewDecisionSchema } from "@/server/validators/schemas";

type P = { id: string };

/** Host: accept (oldest first, while there's room) or decline every waiting request at once. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => decideAll(viewer, params.id, (await readJson(req, crewDecisionSchema)).accept));
