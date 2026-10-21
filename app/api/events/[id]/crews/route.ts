import { created, readJson, withApi } from "@/server/http/api";
import { createCrew, listEventCrews } from "@/server/services/crews.service";
import { crewCreateSchema } from "@/server/validators/schemas";

type P = { id: string };

/** The crews going to this event, and whether you can start one. */
export const GET = withApi<P>({ auth: "optional" }, async ({ params, viewer }) => listEventCrews(viewer, params.id));

/** Start a crew for this event (one per person per event). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => created(await createCrew(viewer, params.id, await readJson(req, crewCreateSchema))));
