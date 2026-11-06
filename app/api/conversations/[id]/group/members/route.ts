import { readJson, withApi } from "@/server/http/api";
import { addChatGroupMembers } from "@/server/services/chat-groups.service";
import { chatGroupMembersSchema } from "@/server/validators/schemas";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => addChatGroupMembers(viewer, params.id, (await readJson(req, chatGroupMembersSchema)).memberIds));
