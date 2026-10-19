import { authResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { changePassword } from "@/server/services/account.service";
import { changePasswordSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "required", limit: { name: "change-password", max: 20, windowMs: 15 * 60_000 } }, async ({ req, viewer }) => {
  const input = await readJson(req, changePasswordSchema);
  return authResponse(req, await changePassword(viewer, input));
});
