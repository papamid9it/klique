import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@/server/db";
import { cronSecret } from "@/server/env";
import { Event, type IEvent } from "@/server/models/Event";
import { Rsvp } from "@/server/models/Rsvp";
import { notifyNow } from "@/server/services/push.service";
import { when } from "@/server/services/events.service";

/**
 * "Starts soon" reminders. Call this every 10-15 minutes from any scheduler (cron-job.org is free, or a
 * Vercel cron) with the CRON_SECRET: either `Authorization: Bearer <secret>` or `?secret=<secret>`.
 * Each event is reminded once: it is marked as soon as its notifications go out.
 */
const LEAD_MS = 75 * 60 * 1000;

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
  const now = new Date();
  const due = await Event.find({ cancelled: false, reminderSentAt: null, startsAt: { $gt: now, $lte: new Date(+now + LEAD_MS) } })
    .limit(200)
    .lean<IEvent[]>();

  let sent = 0;
  for (const e of due) {
    // claim it first so two overlapping runs can't both send
    const claimed = await Event.updateOne({ _id: e._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const going = await Rsvp.find({ eventId: e._id, status: "going" }).select("userId").lean<{ userId: IEvent["_id"] }[]>();
    await notifyNow(
      going.map((g) => g.userId),
      { title: "Starting soon", body: `${e.title} · ${when(e.startsAt)}`, data: { type: "event", id: String(e._id) } },
    );
    sent += going.length;
  }
  return NextResponse.json({ success: true, events: due.length, notified: sent });
}
