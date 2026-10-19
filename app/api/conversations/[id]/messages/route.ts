import { created, readJson, withApi } from "@/server/http/api";
import { sendMessage } from "@/server/services/messaging.service";
import { sendMessageSchema } from "@/server/validators/schemas";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, sendMessageSchema);
  return created(await sendMessage(viewer, params.id, input));
});
