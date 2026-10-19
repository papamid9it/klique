import { withApi } from "@/server/http/api";
import { removeFriend } from "@/server/services/friends.service";

export const DELETE = withApi<{ handle: string }, "required">({ auth: "required" }, async ({ params, viewer }) => removeFriend(viewer, params.handle));
