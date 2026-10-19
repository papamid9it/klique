import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for the API, so a separately hosted web / desktop client can call it.
 * Only origins listed in NEXT_PUBLIC_APP_URL or ALLOWED_ORIGINS are echoed back —
 * never a wildcard, because requests may carry credentials. Native mobile apps
 * send no Origin header and need none of this.
 *
 * Cross-origin clients authenticate with `Authorization: Bearer <token>`
 * (log in with the `X-Klique-Client: native` header to receive the token).
 */
function allowed(): string[] {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return [app, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")].map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Klique-Client",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const ok = !!origin && allowed().includes(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: ok ? 204 : 403, headers: ok ? { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin } : {} });
  }

  const res = NextResponse.next();
  if (ok) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  }
  return res;
}

export const config = { matcher: "/api/:path*" };
