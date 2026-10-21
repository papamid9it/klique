import { readJson, withApi } from "@/server/http/api";
import { decideRequest } from "@/server/services/crews.service";
import { crewDecisionSchema } from "@/server/validators/schemas";

type P = { id: string; userId: string };

/** Host: accept or decline a request to join. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => decideRequest(viewer, params.id, params.userId, (await readJson(req, crewDecisionSchema)).accept));
