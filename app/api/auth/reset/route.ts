import { readJson, withApi } from "@/server/http/api";
import { checkResetToken, resetPassword } from "@/server/services/account.service";
import { resetPasswordSchema, verifyEmailSchema } from "@/server/validators/schemas";

/** Is this reset link still good? (the page asks before showing the form) */
export const PUT = withApi({ auth: "none", limit: { name: "reset-check", max: 30, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const { token } = await readJson(req, verifyEmailSchema);
  return checkResetToken(token);
});

export const POST = withApi({ auth: "none", limit: { name: "reset", max: 10, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const { token, password } = await readJson(req, resetPasswordSchema);
  return resetPassword(token, password);
});
