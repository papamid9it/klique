import { NextResponse } from "next/server";
import { appUrl, isProd } from "@/server/env";
import { setSessionCookie, signSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { withApi } from "@/server/http/api";
import { issueAppCode } from "@/server/services/account.service";
import { STATE_COOKIE, finishGoogle, nativeOfAttempt, signInWithGoogle } from "@/server/services/google.service";

const clear = (res: NextResponse) => {
  res.cookies.set(STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0, secure: isProd() });
  return res;
};
const back = (code: string) => clear(NextResponse.redirect(`${appUrl()}/login?error=${code}`));
const backToApp = (redirect: string, params: Record<string, string>) => clear(NextResponse.redirect(`${redirect}?${new URLSearchParams(params)}`));

/** Step 2: Google sends the browser back here with a one-time code. */
export const GET = withApi({ auth: "none", limit: { name: "google-callback", max: 30, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const cookie = req.cookies.get(STATE_COOKIE)?.value;
  const app = await nativeOfAttempt(cookie);
  const fail = (code: string) => (app ? backToApp(app.redirect, { error: code }) : back(code));

  if (q.get("error")) return fail("google_denied");
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return fail("google_failed");

  try {
    const { profile, next, native } = await finishGoogle(code, state, cookie);
    const { user, isNew } = await signInWithGoogle(profile);

    // Mobile app: hand back a single-use code (redeemed with its PKCE verifier), never the session itself.
    if (native) return backToApp(native.redirect, { code: await issueAppCode(user._id, native.challenge), ...(isNew ? { new: "1" } : {}) });

    // New people land on their profile first; anyone with a destination (an invite link, say) goes there instead.
    const dest = isNew && next === "/" ? "/settings#profile" : next;
    const res = NextResponse.redirect(`${appUrl()}${dest}`);
    setSessionCookie(res, await signSession(String(user._id), user.tokenVersion));
    return clear(res);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code === "google_unverified" || err.code === "suspended" ? err.code : "google_failed");
    console.error("[google] sign-in failed:", err);
    return fail("google_failed");
  }
});
