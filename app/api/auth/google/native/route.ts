import { authResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { googleSession } from "@/server/services/account.service";
import { googleIdTokenSchema } from "@/server/validators/schemas";

/** The phone app signed in with its own Google sheet: check the ID token Google gave it, and start a session. */
export const POST = withApi({ auth: "none", limit: { name: "google-native", max: 20, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const { idToken } = await readJson(req, googleIdTokenSchema);
  return authResponse(req, await googleSession(idToken));
});
