import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { createCrew, listEventCrews } from "@/server/services/crews.service";
import { crewCreateSchema, eventCrewsQuery } from "@/server/validators/schemas";

type P = { id: string };

/** The crews going to this event (`?q=yaba` to find ones from an area, `?limit=` how many), and whether you can start one. */
export const GET = withApi<P>({ auth: "optional" }, async ({ req, params, viewer }) => listEventCrews(viewer, params.id, readQuery(req, eventCrewsQuery)));

/** Start a crew for this event (one per person per event). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => created(await createCrew(viewer, params.id, await readJson(req, crewCreateSchema))));
