import { readJson, withApi } from "@/server/http/api";
import { pinChatMessage } from "@/server/services/chat-groups.service";
import { chatPinSchema } from "@/server/validators/schemas";

/** Pin (on) or unpin a message at the top of a group chat. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { messageId, on } = await readJson(req, chatPinSchema);
  return pinChatMessage(viewer, params.id, messageId, on);
});
