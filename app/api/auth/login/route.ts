import { authResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { login } from "@/server/services/auth.service";
import { loginSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "none", limit: { name: "login", max: 12, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const input = await readJson(req, loginSchema);
  return authResponse(req, await login(input));
});
