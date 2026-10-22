import { readJson, withApi } from "@/server/http/api";
import { reactToCrewMessage } from "@/server/services/crews.service";
import { reactSchema } from "@/server/validators/schemas";

type P = { id: string; messageId: string };

/** Toggle a reaction on a crew chat message. Returns its fresh counts. */
export const POST = withApi<P, "required">({ auth: "required", limit: { name: "chat-react", max: 90, windowMs: 60_000 } }, async ({ req, params, viewer }) => reactToCrewMessage(viewer, params.id, params.messageId, (await readJson(req, reactSchema)).kind));
