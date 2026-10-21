import { withApi } from "@/server/http/api";
import { removeMember } from "@/server/services/crews.service";

type P = { id: string; userId: string };

/** Host: remove someone from the crew. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => removeMember(viewer, params.id, params.userId));
