import { withApi } from "@/server/http/api";
import { blockUser, unblockUser } from "@/server/services/safety.service";

type P = { handle: string };

export const POST = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => blockUser(viewer, params.handle.toLowerCase()));
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => unblockUser(viewer, params.handle.toLowerCase()));
