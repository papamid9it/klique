import { isNativeClient } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { setExplicit } from "@/server/services/users.service";
import { explicitSettingSchema } from "@/server/validators/schemas";

/**
 * Show explicit content on or off. MOBILE APP: on is refused from the app (it sends X-Klique-Client: native);
 * people switch it on on the website, and the app shows it as on. Off works everywhere.
 */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { on, agree } = await readJson(req, explicitSettingSchema);
  return setExplicit(viewer, on, agree === true, isNativeClient(req));
});
