import "server-only";
import { Types } from "mongoose";
import type { AttendanceDTO } from "@/lib/types";
import { badRequest, forbidden, notFound } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import { CrewMember, Crew } from "../models/Crew";
import { Event, type IEvent } from "../models/Event";
import { Rsvp, type IRsvp } from "../models/Rsvp";
import { Subcommunity, type ISubcommunity } from "../models/Subcommunity";
import type { IUser } from "../models/User";
import { canViewEvent, spaceAccess } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { GHOST, loadBriefs } from "../serializers";
import { sid } from "./helpers";
import { awardHype } from "./hype.service";

/**
 * "Who came?": once an event has started, its host (or an admin of its community) ticks off the people who
 * actually showed up. That's what Hype for events is built on: the attendee gets Hype for coming (plus a bit
 * more if they came with a crew), and the host gets some for each person who came. Open from the start until
 * a week after the end. Unticking someone takes the tick away but not Hype already given.
 */

const WINDOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_DURATION_MS = 3 * 60 * 60 * 1000;
/** the host earns for at most this many people per event */
const HOST_MAX = 50;

async function managedEvent(viewer: IUser, id: string): Promise<IEvent> {
  if (!Types.ObjectId.isValid(id)) throw notFound("We couldn't find that event.");
  const event = await Event.findById(id).lean<IEvent>();
  if (!event || !(await canViewEvent(event, viewer))) throw notFound("We couldn't find that event.");
  let allowed = sid(event.hostId) === sid(viewer._id) || isSiteAdmin(viewer);
  if (!allowed && event.communityId) {
    const [community, sub] = await Promise.all([
      Community.findById(event.communityId).lean<ICommunity>(),
      event.subcommunityId ? Subcommunity.findById(event.subcommunityId).lean<ISubcommunity>() : null,
    ]);
    if (community) allowed = (await spaceAccess({ community, sub }, viewer)).canManage;
  }
  if (!allowed) throw forbidden("Only the host can say who came.");
  return event;
}

function windowOf(event: IEvent) {
  const end = event.endsAt ?? new Date(+event.startsAt + FALLBACK_DURATION_MS);
  const now = Date.now();
  return { open: !event.cancelled && now >= +event.startsAt && now <= +end + WINDOW_AFTER_MS, closesAt: new Date(+end + WINDOW_AFTER_MS) };
}

export async function getAttendance(viewer: IUser, id: string): Promise<AttendanceDTO> {
  const event = await managedEvent(viewer, id);
  const rows = await Rsvp.find({ eventId: event._id, status: "going", userId: { $ne: event.hostId } }).sort({ createdAt: 1 }).limit(500).lean<IRsvp[]>();
  const briefs = await loadBriefs(rows.map((r) => r.userId));
  const w = windowOf(event);
  return {
    open: w.open,
    opensAt: event.startsAt.toISOString(),
    closesAt: w.closesAt.toISOString(),
    people: rows.map((r) => ({ user: briefs.get(sid(r.userId)) ?? GHOST, attended: !!r.attendedAt })),
  };
}

export async function setAttendance(viewer: IUser, id: string, userIds: string[], attended: boolean): Promise<AttendanceDTO> {
  const event = await managedEvent(viewer, id);
  const w = windowOf(event);
  if (!w.open) throw badRequest(+event.startsAt > Date.now() ? "You can say who came once the event has started." : "It's been over a week since the event, so attendance is closed.");
  const ids = userIds.filter((u) => u !== sid(event.hostId)).map((u) => new Types.ObjectId(u));
  if (!attended) {
    await Rsvp.updateMany({ eventId: event._id, userId: { $in: ids } }, { $set: { attendedAt: null } });
    return getAttendance(viewer, id);
  }
  // only people who said they're going, and only the ones not ticked already
  const fresh = await Rsvp.find({ eventId: event._id, status: "going", userId: { $in: ids }, attendedAt: null }).select("_id userId").lean<Pick<IRsvp, "_id" | "userId">[]>();
  if (fresh.length) await Rsvp.updateMany({ _id: { $in: fresh.map((r) => r._id) } }, { $set: { attendedAt: new Date() } });

  const ref = `event:${sid(event._id)}`;
  // who went with a crew of 2+ (crews are cleared a day after the event, so tick people off soon for this)
  const crewRows = await CrewMember.find({ eventId: event._id, userId: { $in: fresh.map((r) => r.userId) }, status: "active" }).select("userId crewId").lean<{ userId: Types.ObjectId; crewId: Types.ObjectId }[]>();
  const crews = await Crew.find({ _id: { $in: crewRows.map((r) => r.crewId) }, memberCount: { $gte: 2 } }).distinct("_id");
  const inCrew = new Set(crewRows.filter((r) => crews.some((c) => sid(c) === sid(r.crewId))).map((r) => sid(r.userId)));
  const counted = await Rsvp.countDocuments({ eventId: event._id, attendedAt: { $ne: null } });
  let hostRoom = Math.max(0, HOST_MAX - (counted - fresh.length));

  for (const r of fresh) {
    await awardHype(r.userId, "attend", ref);
    if (inCrew.has(sid(r.userId))) await awardHype(r.userId, "crew", ref);
    if (hostRoom-- > 0) await awardHype(event.hostId, "hostAttendee", `${ref}:${sid(r.userId)}`);
  }
  return getAttendance(viewer, id);
}
