import { created, readJson, withApi } from "@/server/http/api";
import { listConversations, startConversation } from "@/server/services/messaging.service";
import { startConversationSchema } from "@/server/validators/schemas";

/** The inbox. Only ever returns conversations the viewer is a participant in. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => listConversations(viewer));

export const POST = withApi({ auth: "required", limit: { name: "dm-start", max: 30, windowMs: 60 * 60_000 } }, async ({ req, viewer }) => {
  const { handle, message } = await readJson(req, startConversationSchema);
  return created(await startConversation(viewer, handle, message));
});
