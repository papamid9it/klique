import { readJson, withApi } from "@/server/http/api";
import { markNotificationsRead } from "@/server/services/notifications.service";
import { notificationsReadSchema } from "@/server/validators/schemas";

/** Mark notifications read: `{ ids }` or `{ all: true }`. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => markNotificationsRead(viewer, await readJson(req, notificationsReadSchema)));
