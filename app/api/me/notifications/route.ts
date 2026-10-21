import { readQuery, withApi } from "@/server/http/api";
import { listNotifications } from "@/server/services/notifications.service";
import { notificationsQuery } from "@/server/validators/schemas";

/** Your notification inbox, newest first, with the unread count. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => listNotifications(viewer, readQuery(req, notificationsQuery)));
