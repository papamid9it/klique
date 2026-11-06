import { created, readJson, withApi } from "@/server/http/api";
import { createChatGroup } from "@/server/services/chat-groups.service";
import { chatGroupCreateSchema } from "@/server/validators/schemas";

/** Start a group chat with your friends. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => created(await createChatGroup(viewer, await readJson(req, chatGroupCreateSchema))));
