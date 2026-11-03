import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { connectDb } from "../db";
import type { IBotApp } from "../models/BotApp";
import type { IUser } from "../models/User";
import { authBot } from "../services/bots.service";
import { ApiError } from "./errors";
import { rateLimitShared } from "./rate-limit";

/**
 * The bot API (/api/bot/v1/…): `Authorization: Bot <token>`, JSON in and out, 120 calls a minute per bot. Every
 * action goes through the same services (and so the same permission, rank, AutoMod and timeout rules) as a person.
 */
export function botRoute<P>(handler: (ctx: { req: NextRequest; params: P; app: IBotApp; bot: IUser }) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      await connectDb();
      const { app, bot } = await authBot(req.headers.get("authorization"));
      await rateLimitShared(`botapi:${String(app._id)}`, 120, 60_000);
      const data = await handler({ req, params: await ctx.params, app, bot });
      return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ success: false, message: err.message, ...(err.errors ? { errors: err.errors } : {}) }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ success: false, message: err.issues[0]?.message ?? "That isn't valid." }, { status: 400 });
      console.error("[bot-api]", (err as Error).message);
      return NextResponse.json({ success: false, message: "Something went wrong." }, { status: 500 });
    }
  };
}

export async function botJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Send JSON.");
  }
  return schema.parse(raw);
}
