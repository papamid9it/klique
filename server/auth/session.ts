import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { authSecret, isProd, sessionDays } from "../env";

/**
 * Sessions are signed JWTs. The SAME token works two ways:
 *   - web: stored in an httpOnly, SameSite=Lax cookie (not readable by page scripts)
 *   - native / desktop apps: sent as `Authorization: Bearer <token>`
 * Every request re-checks the user's `tokenVersion`, so tokens can be revoked server-side.
 */

export const SESSION_COOKIE = "klique_session";

export interface SessionClaims {
  sub: string;
  tv: number;
}

export async function signSession(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${sessionDays()}d`)
    .sign(authSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number") return null;
    return { sub: payload.sub, tv: payload.tv };
  } catch {
    return null;
  }
}

export function tokenFromRequest(req: NextRequest): { token: string; via: "bearer" | "cookie" } | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return { token, via: "bearer" };
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  return cookie ? { token: cookie, via: "cookie" } : null;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: sessionDays() * 24 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/", maxAge: 0 });
}
