import { readJson, withApi } from "@/server/http/api";
import { deleteMessage, editMessage } from "@/server/services/messaging.service";
import { editMessageSchema } from "@/server/validators/schemas";

type P = { id: string; messageId: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { body } = await readJson(req, editMessageSchema);
  return editMessage(viewer, params.id, params.messageId, body);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteMessage(viewer, params.id, params.messageId));
