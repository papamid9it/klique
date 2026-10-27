import "server-only";
import { Event, type IEvent } from "../models/Event";
import { JobRun } from "../models/JobRun";
import { Rsvp } from "../models/Rsvp";
import { when } from "./events.service";
import { notifyNow } from "./push.service";
import { runCrewReminders } from "./crews.service";
import { runAdLifecycle } from "./ad-campaigns.service";
import { runStyleLifecycle } from "./wallet.service";

/**
 * "Starting soon" reminders to everyone going, on their phones (mobile app) and browsers (desktop and web app).
 * Each event is reminded once: it is claimed before its notifications go out.
 */
const LEAD_MS = 75 * 60 * 1000;

export async function runReminders(): Promise<{ events: number; notified: number }> {
  const now = new Date();
  const due = await Event.find({ cancelled: false, review: null, reminderSentAt: null, startsAt: { $gt: now, $lte: new Date(+now + LEAD_MS) } })
    .limit(200)
    .lean<IEvent[]>();

  let notified = 0;
  for (const e of due) {
    // claim it first so two overlapping runs can't both send
    const claimed = await Event.updateOne({ _id: e._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const going = await Rsvp.find({ eventId: e._id, status: "going" }).select("userId").lean<{ userId: IEvent["_id"] }[]>();
    await notifyNow(
      going.map((g) => g.userId),
      { title: "Starting soon", body: `${e.title} · ${when(e.startsAt)}`, data: { type: "event", id: String(e._id) } },
      { category: "events", ref: `event:${String(e._id)}`, image: e.coverImage ?? null, action: { kind: "event", eventId: String(e._id) } },
    );
    notified += going.length;
  }
  // crews hear about an hour before their own meetup time
  notified += await runCrewReminders(now);
  // ads: "ends tomorrow" and "ended" (with results)
  notified += await runAdLifecycle(now);
  // Hype: styles from before unlocks existed, "ends in 3 days", auto-renew or take off
  notified += await runStyleLifecycle(now);
  return { events: due.length, notified };
}

/* ------------------------------------------------------------------ */
/* Run without an outside scheduler                                    */
/* ------------------------------------------------------------------ */

const EVERY_MS = 5 * 60 * 1000;
let lastCheck = 0;

/**
 * Called after API requests: at most every 5 minutes across all servers, run the reminder job. So reminders go
 * out while people are using klique even with no cron set up. A cron hitting /api/cron/reminders still works
 * and covers quiet hours.
 */
export async function maybeRunReminders() {
  const now = Date.now();
  if (now - lastCheck < 60_000) return; // this server checked a moment ago
  lastCheck = now;
  // one atomic claim in the database decides which server runs it
  const claimed = await JobRun.findOneAndUpdate(
    { _id: "reminders", lastRunAt: { $lt: new Date(now - EVERY_MS) } },
    { $set: { lastRunAt: new Date(now) } },
    { returnDocument: "after" },
  ).lean();
  if (!claimed) {
    // first run ever: create the row (a duplicate key from a racing server just means it won)
    const exists = await JobRun.exists({ _id: "reminders" });
    if (exists) return;
    try {
      await JobRun.create({ _id: "reminders", lastRunAt: new Date(now) });
    } catch {
      return;
    }
  }
  await runReminders();
}
