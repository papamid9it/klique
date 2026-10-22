import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { listCrewMessages, postCrewMessage } from "@/server/services/crews.service";
import { crewMessageSchema, crewMessagesQuery } from "@/server/validators/schemas";

type P = { id: string };

/** The crew's chat (members only), oldest first: the newest page, `?before=<id>` for older ones, `?after=<id>` for newer. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => listCrewMessages(viewer, params.id, readQuery(req, crewMessagesQuery)));

/** Post to the chat: text, up to 4 pictures, or a sticker; `replyToId` answers an earlier message (its author is told). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { replyToId, ...input } = await readJson(req, crewMessageSchema);
  return created(await postCrewMessage(viewer, params.id, input, replyToId ?? null));
});
