import { NextResponse } from "next/server";
import { isProd } from "@/server/env";
import { withApi } from "@/server/http/api";
import { STATE_COOKIE, nativeFromQuery, safeNext, startGoogle } from "@/server/services/google.service";

/** Step 1: send the browser to Google's account chooser (web), or do the same for the mobile app (client=native). */
export const GET = withApi({ auth: "none", limit: { name: "google-start", max: 30, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const { url, cookie } = await startGoogle(safeNext(q.get("next")), nativeFromQuery(q));
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: isProd(), path: "/api/auth/google", maxAge: 600 });
  return res;
});
