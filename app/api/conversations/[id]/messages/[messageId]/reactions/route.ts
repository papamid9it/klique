import { readJson, withApi } from "@/server/http/api";
import { reactToMessage } from "@/server/services/messaging.service";
import { reactSchema } from "@/server/validators/schemas";

export const POST = withApi<{ id: string; messageId: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { kind } = await readJson(req, reactSchema);
  return reactToMessage(viewer, params.id, params.messageId, kind);
});
