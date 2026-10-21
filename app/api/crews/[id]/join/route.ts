import { readJson, withApi } from "@/server/http/api";
import { joinCrew, leaveCrew } from "@/server/services/crews.service";
import { crewJoinSchema } from "@/server/validators/schemas";

type P = { id: string };

/** Join an open crew, or ask to join one that needs the host's OK. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => joinCrew(viewer, params.id, (await readJson(req, crewJoinSchema)).message));

/** Leave, or take back a request. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => leaveCrew(viewer, params.id));
