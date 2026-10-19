import { randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { LIMITS } from "@/lib/constants";
import { appUrl, authSecret, googleConfig, nativeRedirects } from "../env";
import { ApiError } from "../http/errors";
import { User, type IUser } from "../models/User";
import { assertNotSuspended } from "../policies/account";

/**
 * "Continue with Google" using the standard OpenID Connect code flow, written against the plain endpoints
 * (no auth library): redirect to Google, get a one-time code back, swap it for an ID token on the server, and
 * verify that token's signature, audience, issuer and nonce. The browser never sees a Google secret.
 */
export const STATE_COOKIE = "klique_oauth";
const STATE_MINUTES = 10;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const redirectUri = () => `${appUrl()}/api/auth/google/callback`;

function config() {
  const cfg = googleConfig();
  if (!cfg) throw new ApiError(503, "Google sign-in isn't set up on this server yet.", { code: "google_off" });
  return cfg;
}

/** Same-site relative paths only, so the sign-in flow can't be used as an open redirect. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/api/") ? n : "/");

/** Where to send the browser, plus the signed cookie value that proves the callback belongs to this attempt. */
export interface NativeStart {
  /** exact address (from the server's allow-list) to send the browser back to */
  redirect: string;
  /** sha256 hex of the verifier the app keeps secret */
  challenge: string;
}

/** Validate what a mobile app asked for; null means "this is a normal web sign-in". */
export function nativeFromQuery(q: URLSearchParams): NativeStart | null {
  if (q.get("client") !== "native") return null;
  const redirect = q.get("redirect") ?? "";
  const challenge = q.get("challenge") ?? "";
  if (!nativeRedirects().includes(redirect) || !/^[a-f0-9]{64}$/.test(challenge)) {
    throw new ApiError(400, "That app sign-in request isn't valid.", { code: "google_failed" });
  }
  return { redirect, challenge };
}

export async function startGoogle(next: string, native: NativeStart | null = null): Promise<{ url: string; cookie: string }> {
  const { clientId } = config();
  const nonce = randomBytes(16).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const cookie = await new SignJWT({ nonce, state, next: safeNext(next), ...(native ? { native } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_MINUTES}m`)
    .sign(authSecret());
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return { url: `${AUTH_URL}?${params}`, cookie };
}

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/** Which app (if any) this attempt belongs to, so even a failure can be sent back to it. Null when the cookie is missing or bad. */
export async function nativeOfAttempt(cookie: string | undefined): Promise<NativeStart | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, authSecret(), { algorithms: ["HS256"] });
    const n = (payload as { native?: NativeStart }).native;
    return n && nativeRedirects().includes(n.redirect) ? n : null;
  } catch {
    return null;
  }
}

/** Check the callback against the cookie, trade the code for tokens, and return who Google says this is. */
export async function finishGoogle(code: string, state: string, cookie: string | undefined): Promise<{ profile: GoogleProfile; next: string; native: NativeStart | null }> {
  const { clientId, clientSecret } = config();
  if (!cookie) throw new ApiError(400, "That sign-in attempt expired. Please try again.", { code: "google_failed" });

  let saved: { nonce: string; state: string; next: string; native?: NativeStart };
  try {
    const { payload } = await jwtVerify(cookie, authSecret(), { algorithms: ["HS256"] });
    saved = payload as unknown as typeof saved;
  } catch {
    throw new ApiError(400, "That sign-in attempt expired. Please try again.", { code: "google_failed" });
  }
  if (!state || state !== saved.state) throw new ApiError(400, "That sign-in attempt didn't match. Please try again.", { code: "google_failed" });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new ApiError(502, "Google didn't accept that sign-in. Please try again.", { code: "google_failed" });
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new ApiError(502, "Google didn't send back an identity.", { code: "google_failed" });

  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(tokens.id_token, JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId });
    claims = payload;
  } catch {
    throw new ApiError(502, "We couldn't verify the sign-in with Google.", { code: "google_failed" });
  }
  if (claims.nonce !== saved.nonce) throw new ApiError(400, "That sign-in attempt didn't match. Please try again.", { code: "google_failed" });
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new ApiError(502, "Google didn't share an email address.", { code: "google_failed" });
  // An unverified Google email must never be allowed to claim an existing klique account.
  if (claims.email_verified !== true) throw new ApiError(403, "Your Google email isn't verified.", { code: "google_unverified" });

  const email = claims.email.toLowerCase();
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email.split("@")[0];
  return {
    profile: { sub: claims.sub, email, name: name.slice(0, LIMITS.displayName), picture: typeof claims.picture === "string" && /^https:\/\//.test(claims.picture) ? claims.picture : null },
    next: safeNext(saved.next),
    native: saved.native && nativeRedirects().includes(saved.native.redirect) ? saved.native : null,
  };
}

async function freeHandle(seed: string): Promise<string> {
  let base = seed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, LIMITS.handleMax - 5);
  if (base.length < LIMITS.handleMin) base = (base + "member").slice(0, 10);
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await User.exists({ handle: candidate }))) return candidate;
  }
  return `${base}${randomBytes(3).toString("hex")}`.slice(0, LIMITS.handleMax);
}

/** The klique account for this Google identity: existing link, existing email (now linked), or a brand new one. */
export async function signInWithGoogle(p: GoogleProfile): Promise<{ user: IUser; isNew: boolean }> {
  const byGoogle = await User.findOne({ googleId: p.sub }).lean<IUser>();
  if (byGoogle) {
    assertNotSuspended(byGoogle);
    return { user: byGoogle, isNew: false };
  }

  const byEmail = await User.findOne({ email: p.email }).lean<IUser>();
  if (byEmail) {
    assertNotSuspended(byEmail);
    // Google vouches for this address, so linking is safe and also proves ownership of the email.
    const linked = await User.findByIdAndUpdate(
      byEmail._id,
      { googleId: p.sub, ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
      { new: true },
    ).lean<IUser>();
    return { user: linked ?? byEmail, isNew: false };
  }

  const created = await User.create({
    email: p.email,
    googleId: p.sub,
    hasPassword: false,
    emailVerifiedAt: new Date(),
    handle: await freeHandle(p.email.split("@")[0]),
    displayName: p.name,
    avatarUrl: p.picture,
  });
  return { user: created.toObject() as IUser, isNew: true };
}
