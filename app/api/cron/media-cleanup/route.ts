import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@/server/db";
import { cronSecret } from "@/server/env";
import { sweepOrphanedUploads } from "@/server/services/media-sweep";

/**
 * Deletes uploads nothing uses any more (pictures picked in a form that was never saved, and the like),
 * so Cloudinary storage only holds what the app shows. Call it once a night from any scheduler with the
 * CRON_SECRET: `Authorization: Bearer <secret>` or `?secret=<secret>`.
 * Add `?dry=1` to see what it would delete without deleting anything.
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
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  try {
    const result = await sweepOrphanedUploads({ dryRun });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[media-cleanup] stopped, nothing deleted:", (e as Error).message);
    return NextResponse.json({ success: false, message: "Couldn't take stock of uploads, so nothing was deleted." }, { status: 503 });
  }
}
