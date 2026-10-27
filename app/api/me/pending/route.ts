import { withApi } from "@/server/http/api";
import { pendingForMe } from "@/server/services/notifications.service";

/** Join requests waiting on you (crews you host, private communities you run), for the Notifications page. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => pendingForMe(viewer));
