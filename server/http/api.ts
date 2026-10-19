import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { connectDb } from "../db";
import { allowedOrigins } from "../env";
import { tokenFromRequest, verifySession } from "../auth/session";
import { User, type IUser } from "../models/User";
import { ApiError, unauthorized } from "./errors";
import { rateLimitShared } from "./rate-limit";
import type { Envelope } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

export function respond<T>(data: T, init?: { status?: number; message?: string }) {
  const body: Envelope<T> = { success: true, data, ...(init?.message ? { message: init.message } : {}) };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { "Cache-Control": "no-store" } });
}

export const created = <T>(data: T, message?: string) => respond(data, { status: 201, message });

export function failure(status: number, message: string, errors?: Record<string, string>, code?: string) {
  return NextResponse.json(
    { success: false, data: null, message, ...(errors ? { errors } : {}), ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/* ------------------------------------------------------------------ */
/* Request parsing & validation                                        */
/* ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 64 * 1024;

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Send the request body as application/json.");
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "That request is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "The request body isn't valid JSON.");
  }
  return schema.parse(raw);
}

export function readQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

function zodToErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Security helpers                                                    */
/* ------------------------------------------------------------------ */

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * CSRF defence for cookie-authenticated browser requests. Bearer-token clients
 * (mobile/desktop) are exempt — they don't use ambient credentials.
 * Browsers always send Origin on cross-site mutating requests.
 */
function assertTrustedOrigin(req: NextRequest, usedBearer: boolean) {
  if (usedBearer) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "Blocked: invalid origin.", { code: "bad_origin" });
  }
  if (originHost === host) return;
  if (allowedOrigins().includes(origin.replace(/\/$/, ""))) return;
  throw new ApiError(403, "Blocked: this origin isn't allowed to call the API.", { code: "bad_origin" });
}

/* ------------------------------------------------------------------ */
/* The wrapper                                                         */
/* ------------------------------------------------------------------ */

type AuthMode = "required" | "optional" | "none";

export interface ApiContext<P, A extends AuthMode> {
  req: NextRequest;
  params: P;
  viewer: A extends "required" ? IUser : IUser | null;
  ip: string;
}

interface Options<A extends AuthMode> {
  auth: A;
  /** seconds a CDN / browser may reuse an anonymous GET response (signed-in requests are never cached) */
  publicCache?: number;
  /** per-IP limit for this endpoint */
  limit?: { name: string; max: number; windowMs: number };
}

type Handler<P, A extends AuthMode> = (ctx: ApiContext<P, A>) => Promise<Response | unknown>;

/**
 * Wraps a route handler with: origin check → rate limit → DB connection →
 * authentication → handler → uniform JSON envelope and error mapping.
 * Every endpoint goes through here, so authorization can't be forgotten at the edge —
 * resource-level checks live in server/policies and are enforced in services.
 */
export function withApi<P = Record<string, never>, A extends AuthMode = "optional">(
  opts: Options<A>,
  handler: Handler<P, A>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    try {
      const ip = clientIp(req);
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const tok = tokenFromRequest(req);

      if (mutating) assertTrustedOrigin(req, tok?.via === "bearer");
      if (opts.limit) await rateLimitShared(`${opts.limit.name}:${ip}`, opts.limit.max, opts.limit.windowMs);

      await connectDb();

      let viewer: IUser | null = null;
      if (opts.auth !== "none" && tok) {
        const claims = await verifySession(tok.token);
        if (claims) {
          const user = await User.findById(claims.sub).lean<IUser>();
          if (user && user.tokenVersion === claims.tv) viewer = user;
          if (viewer?.suspendedAt) throw new ApiError(403, "This account has been suspended. Contact support if you think that's a mistake.", { code: "suspended" });
        }
      }
      if (opts.auth === "required" && !viewer) throw unauthorized();

      const params = (await routeCtx.params) as P;
      const out = await handler({ req, params, viewer: viewer as ApiContext<P, A>["viewer"], ip });
      const res = out instanceof Response ? out : respond(out);
      if (opts.publicCache && req.method === "GET" && !tok && res.ok) {
        res.headers.set("Cache-Control", `public, max-age=${Math.min(opts.publicCache, 15)}, s-maxage=${opts.publicCache}, stale-while-revalidate=${opts.publicCache * 4}`);
        res.headers.append("Vary", "Cookie, Authorization");
      }
      return res;
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return failure(err.status, err.message, err.errors, err.code);

  if (err instanceof ZodError) {
    const errors = zodToErrors(err);
    return failure(422, Object.values(errors)[0] ?? "Please check the highlighted fields.", errors, "validation_failed");
  }

  const e = err as { code?: number; keyPattern?: Record<string, unknown>; name?: string };
  if (e?.code === 11000) {
    const field = Object.keys(e.keyPattern ?? {})[0];
    const message =
      field === "email"
        ? "An account with that email already exists."
        : field === "handle"
          ? "That handle is already taken."
          : field === "slug"
            ? "That name is already in use — try another."
            : "That already exists.";
    const errors = field && ["email", "handle"].includes(field) ? { [field]: message } : undefined;
    return failure(409, message, errors, "duplicate");
  }
  if (e?.name === "ValidationError") return failure(422, "Some details aren't valid.", undefined, "validation_failed");
  if (e?.name === "CastError") return failure(404, "We couldn't find that.", undefined, "not_found");

  // Unknown: log for operators, never leak internals to clients.
  console.error("[api] unhandled error:", err);
  return failure(500, "Something went wrong on our side. Please try again.", undefined, "internal_error");
}
