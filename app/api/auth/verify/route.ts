import { readJson, withApi } from "@/server/http/api";
import { verifyEmail } from "@/server/services/account.service";
import { verifyEmailSchema } from "@/server/validators/schemas";

export const POST = withApi({ auth: "none", limit: { name: "verify-email", max: 20, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const { token } = await readJson(req, verifyEmailSchema);
  return verifyEmail(token);
});
