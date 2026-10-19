import { readQuery, withApi } from "@/server/http/api";
import { getConversation } from "@/server/services/messaging.service";
import { messageListQuery } from "@/server/validators/schemas";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { before } = readQuery(req, messageListQuery);
  return getConversation(viewer, params.id, before);
});
