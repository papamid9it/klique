import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { LIMITS } from "@/lib/constants";
import { ApiError } from "../http/errors";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Who Google says this is, from an ID token: its signature, that it's for this app, that it's from Google and hasn't
 * expired, and that the email is verified (an unverified one must never claim an existing account). Nothing in the
 * token is trusted until all of that passes.
 */
export async function profileFromIdToken(idToken: string, clientId: string, keys: JWTVerifyGetKey = GOOGLE_KEYS): Promise<GoogleProfile> {
  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(idToken, keys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId, algorithms: ["RS256"] }));
  } catch {
    throw new ApiError(401, "We couldn't verify the sign-in with Google. Please try again.", { code: "google_failed" });
  }
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new ApiError(502, "Google didn't share an email address.", { code: "google_failed" });
  if (claims.email_verified !== true) throw new ApiError(403, "Your Google email isn't verified.", { code: "google_unverified" });
  const email = claims.email.toLowerCase();
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0];
  return { sub: claims.sub, email, name: name.slice(0, LIMITS.displayName), picture: typeof claims.picture === "string" && /^https:\/\//.test(claims.picture) ? claims.picture : null };
}
