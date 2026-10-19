import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@/server/db";
import { cronSecret } from "@/server/env";
import { runSources } from "@/server/services/event-import.service";

/**
 * The nightly event finder: checks every source page saved in /admin and adds new upcoming events to the
 * inbox as pending drafts (nothing goes live until an admin approves it). Call it once a night from any
 * scheduler with the CRON_SECRET: `Authorization: Bearer <secret>` or `?secret=<secret>`.
 */
export const maxDuration = 300;

function authorised(req: NextRequest) {
  const secret = cronSecret();
  if (!secret) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ success: false, message: "Not allowed." }, { status: 401 });
  await connectDb();
  return NextResponse.json({ success: true, ...(await runSources()) });
}
