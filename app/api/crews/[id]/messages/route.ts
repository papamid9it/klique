import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { listCrewMessages, postCrewMessage } from "@/server/services/crews.service";
import { crewMessageSchema, crewMessagesQuery } from "@/server/validators/schemas";

type P = { id: string };

/** The crew's chat (members only). `?after=<id>` returns only newer messages. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => listCrewMessages(viewer, params.id, readQuery(req, crewMessagesQuery).after));

/** Post to the chat; `replyToId` answers an earlier message (its author is told). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { body, replyToId } = await readJson(req, crewMessageSchema);
  return created(await postCrewMessage(viewer, params.id, body, replyToId ?? null));
});
