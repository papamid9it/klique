import { authResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { signup } from "@/server/services/auth.service";
import { signupSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "none", limit: { name: "signup", max: 10, windowMs: 60 * 60_000 } }, async ({ req }) => {
  const input = await readJson(req, signupSchema);
  return authResponse(req, await signup(input), 201);
});
