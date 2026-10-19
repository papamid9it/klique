import { readJson, withApi } from "@/server/http/api";
import { forgotPassword } from "@/server/services/account.service";
import { forgotPasswordSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "none", limit: { name: "forgot", max: 8, windowMs: 60 * 60_000 } }, async ({ req }) => {
  const { email } = await readJson(req, forgotPasswordSchema);
  return forgotPassword(email);
});
