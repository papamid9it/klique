import { authResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { exchangeAppCode } from "@/server/services/account.service";
import { appCodeSchema } from "@/server/validators/schemas";

/** The mobile app trades the one-time code from Google sign-in (plus its PKCE verifier) for a session token. */
export const POST = withApi({ auth: "none", limit: { name: "app-exchange", max: 20, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const { code, verifier } = await readJson(req, appCodeSchema);
  return authResponse(req, await exchangeAppCode(code, verifier));
});
