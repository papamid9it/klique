import type { NextRequest } from "next/server";
import type { AuthResult } from "../services/auth.service";
import { respond } from "./api";
import { clearSessionCookie, setSessionCookie } from "../auth/session";

/**
 * Native / desktop apps send `X-Klique-Client: native` and keep the returned token
 * (sent back as `Authorization: Bearer …`). The web app never receives the token
 * in JSON — it only gets the httpOnly cookie, which page scripts cannot read.
 */
export const isNativeClient = (req: NextRequest) => req.headers.get("x-klique-client")?.toLowerCase() === "native";

export function authResponse(req: NextRequest, result: AuthResult, status = 200) {
  const native = isNativeClient(req);
  const res = respond(native ? { user: result.user, token: result.token } : { user: result.user }, { status });
  if (!native) setSessionCookie(res, result.token);
  return res;
}

export function signedOutResponse() {
  const res = respond({ signedOut: true });
  clearSessionCookie(res);
  return res;
}
