import { withApi } from "@/server/http/api";
import { removeChatGroupMember } from "@/server/services/chat-groups.service";

/** Leave (your own id), or the owner removes someone. */
export const DELETE = withApi<{ id: string; userId: string }, "required">({ auth: "required" }, async ({ params, viewer }) => removeChatGroupMember(viewer, params.id, params.userId));
