import { withApi } from "@/server/http/api";
import { markRead } from "@/server/services/messaging.service";

export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => markRead(viewer, params.id));
