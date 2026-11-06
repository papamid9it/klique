import { readJson, withApi } from "@/server/http/api";
import { getChatGroup, renameChatGroup } from "@/server/services/chat-groups.service";
import { chatGroupRenameSchema } from "@/server/validators/schemas";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => getChatGroup(viewer, params.id));

export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => renameChatGroup(viewer, params.id, (await readJson(req, chatGroupRenameSchema)).name));
