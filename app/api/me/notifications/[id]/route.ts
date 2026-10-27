import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { removeNotification, setNotificationRead } from "@/server/services/notifications.service";

type P = { id: string };

/** Mark one notification read or unread again. */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { read } = await readJson(req, z.object({ read: z.boolean() }));
  return setNotificationRead(viewer, params.id, read);
});

/** Take one notification out of your inbox. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => removeNotification(viewer, params.id));
