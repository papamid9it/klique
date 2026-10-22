import { readJson, withApi } from "@/server/http/api";
import { deleteCrewMessage, editCrewMessage } from "@/server/services/crews.service";
import { crewEditSchema } from "@/server/validators/schemas";

type P = { id: string; messageId: string };

/** Change the text of your own message. */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => editCrewMessage(viewer, params.id, params.messageId, (await readJson(req, crewEditSchema)).body));

/** Delete your own message (the host can remove anyone's). */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteCrewMessage(viewer, params.id, params.messageId));
