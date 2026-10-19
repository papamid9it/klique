import { signedOutResponse } from "@/server/http/auth-response";
import { withApi } from "@/server/http/api";
import { revokeAllSessions } from "@/server/services/auth.service";

/** "Sign out everywhere": bumps tokenVersion so every issued token (web + native) stops working. */
export const POST = withApi({ auth: "required" }, async ({ viewer }) => {
  await revokeAllSessions(String(viewer._id));
  return signedOutResponse();
});
