import { signedOutResponse } from "@/server/http/auth-response";
import { withApi } from "@/server/http/api";

/** Clears the web cookie. Native apps just discard their stored token. */
export const POST = withApi({ auth: "none" }, async () => signedOutResponse());
