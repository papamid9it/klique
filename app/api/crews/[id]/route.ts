import { readJson, withApi } from "@/server/http/api";
import { deleteCrew, getCrew, updateCrew } from "@/server/services/crews.service";
import { crewUpdateSchema } from "@/server/validators/schemas";

type P = { id: string };

export const GET = withApi<P>({ auth: "optional" }, async ({ params, viewer }) => getCrew(viewer, params.id));

/** Host: change the meetup point, time, note, join mode or size. */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => updateCrew(viewer, params.id, await readJson(req, crewUpdateSchema)));

/** Host: call the crew off. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteCrew(viewer, params.id));
