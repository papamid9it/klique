import { readJson, withApi } from "@/server/http/api";
import { editChatGroup, getChatGroup } from "@/server/services/chat-groups.service";
import { chatGroupEditSchema } from "@/server/validators/schemas";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => getChatGroup(viewer, params.id));

/** Change the group's name, photo, description, or (the owner) whether members may edit it and pin. */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => editChatGroup(viewer, params.id, await readJson(req, chatGroupEditSchema)));
