import { readJson, withApi } from "@/server/http/api";
import { getNotifyPrefs, updateNotifyPrefs } from "@/server/services/notifications.service";
import { notifyPrefsSchema } from "@/server/validators/schemas";

/** What you want to be notified about, in the app and as push. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => getNotifyPrefs(viewer));
export const PATCH = withApi({ auth: "required" }, async ({ req, viewer }) => updateNotifyPrefs(viewer, await readJson(req, notifyPrefsSchema)));
