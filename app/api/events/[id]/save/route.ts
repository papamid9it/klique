import { withApi } from "@/server/http/api";
import { setSaved } from "@/server/services/events.service";

type P = { id: string };

export const POST = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => setSaved(viewer, params.id, true));
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => setSaved(viewer, params.id, false));
