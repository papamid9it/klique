import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@/server/db";
import { cronSecret } from "@/server/env";
import { runReminders } from "@/server/services/reminders.service";

/**
 * "Starts soon" reminders. They also run on their own every few minutes while people use the site; calling this
 * every 10-15 minutes from a scheduler (cron-job.org is free) covers quiet hours too. Pass the CRON_SECRET as
 * `Authorization: Bearer <secret>` or `?secret=<secret>`.
 */
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
  return NextResponse.json({ success: true, ...(await runReminders()) });
}
