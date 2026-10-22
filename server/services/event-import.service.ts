import "server-only";
import type { Types } from "mongoose";
import { isInterestId } from "@/lib/constants";
import type { DraftBulkResult, DraftDTO, DraftPatch, FinderQueryDTO, FinderRunDTO, SavedSearchDTO, SourceDTO } from "@/lib/types";
import { getCountry, slugify } from "@/lib/places";
import { badRequest, notFound } from "../http/errors";
import { EventDraft, EventSource, FinderRun, SavedSearch, type IEventDraft, type IEventSource, type IFinderRun, type ISavedSearch } from "../models/EventDraft";
import { Event } from "../models/Event";
import type { IUser } from "../models/User";
import { assertPublicHttpUrl } from "../net-guard";
import { eventCreateSchema } from "../validators/schemas";
import { createEvent } from "./events.service";
import { assertScrapable } from "./finder/http";
import { eventbriteOrgId } from "./finder/providers";
import { createRun, cronFinder, stepRun } from "./finder/run";

/**
 * The event finder (Admin → Event finder). A search becomes a job (see finder/run.ts) that reads official
 * APIs, the pages / calendars / feeds saved here, and any links pasted in, a source at a time. Everything it
 * finds lands in the review queue as a pending draft; nothing is public until an admin posts it.
 */

const DAY = 86_400_000;

/* ------------------------------ service ----------------------------- */

/* ------------------------------- runs ------------------------------- */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const runDto = (r: IFinderRun): FinderRunDTO => ({
  id: String(r._id),
  status: r.status,
  trigger: r.trigger ?? "admin",
  query: { country: r.query.country, region: r.query.region, city: r.query.city, interests: r.query.interests, from: r.query.from.toISOString(), to: r.query.to.toISOString(), includeSources: r.query.includeSources, urls: r.query.urls },
  tasks: r.tasks.map((t) => ({ kind: t.kind, label: t.label, status: t.status, found: t.found, added: t.added, note: t.note })),
  done: r.tasks.filter((t) => t.status === "done" || t.status === "failed").length,
  found: r.found,
  added: r.added,
  duplicates: r.duplicates,
  filtered: r.filtered,
  createdAt: r.createdAt.toISOString(),
  finishedAt: iso(r.finishedAt),
});

function checkUrl(raw: string): string {
  let u: URL;
  try {
    u = assertPublicHttpUrl(raw);
  } catch {
    throw badRequest(`"${raw.slice(0, 80)}" isn't a full public link (it should start with https://)`);
  }
  try {
    if (!eventbriteOrgId(u.toString())) assertScrapable(u);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  return u.toString();
}

/** "Find events": record the job. The page then asks for its steps (and the cron finishes anything left). */
export async function startSearch(admin: IUser, q: Omit<FinderQueryDTO, "from" | "to"> & { from: string; to: string }): Promise<FinderRunDTO> {
  if (q.country && !getCountry(q.country)) throw badRequest("Pick a country.");
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (Number.isNaN(+from) || Number.isNaN(+to) || to <= from) throw badRequest("Pick a date range that ends after it starts.");
  if (+to - +from > 366 * DAY) throw badRequest("Search up to a year at a time.");
  const urls = [...new Set(q.urls.map((u) => u.trim()).filter(Boolean))].slice(0, 20).map(checkUrl);
  if (!q.includeSources && !urls.length && !q.country) throw badRequest("Pick a place, or add a link to read.");
  const run = await createRun({ country: q.country.toUpperCase(), region: q.region, city: slugify(q.city), interests: q.interests.filter((i) => isInterestId(i)), from, to, includeSources: q.includeSources, urls }, admin._id);
  return runDto(run);
}

/** Paste a link: read it (and the event pages it lists) for upcoming events anywhere. */
export async function importFromUrl(admin: IUser, rawUrl: string): Promise<FinderRunDTO> {
  const from = new Date();
  return startSearch(admin, { country: "", region: "", city: "", interests: [], from: from.toISOString(), to: new Date(+from + 365 * DAY).toISOString(), includeSources: false, urls: [rawUrl] });
}

/** Work on a job for a few seconds (one source at a time) and say where it is. */
export async function stepSearch(id: string): Promise<FinderRunDTO> {
  const run = await stepRun(id, 12_000);
  if (!run) throw notFound("That search is gone.");
  return runDto(run);
}

export async function getRun(id: string): Promise<FinderRunDTO> {
  const run = await FinderRun.findById(id).lean<IFinderRun>();
  if (!run) throw notFound("That search is gone.");
  return runDto(run);
}

export async function recentRuns(): Promise<FinderRunDTO[]> {
  return (await FinderRun.find().sort({ createdAt: -1 }).limit(8).lean<IFinderRun[]>()).map(runDto);
}

/** The nightly cron: saved searches (one at a time), the saved pages, and anything left unfinished. */
export const nightlyFinder = () => cronFinder();

const toDto = (d: IEventDraft): DraftDTO => ({
  id: String(d._id),
  status: d.status,
  sourceUrl: d.sourceUrl,
  sourceName: d.sourceName,
  title: d.title,
  description: d.description,
  interest: d.interest,
  organizerName: d.organizerName,
  country: d.country,
  region: d.region,
  city: d.city,
  venue: d.venue,
  online: d.online,
  startsAt: d.startsAt ? d.startsAt.toISOString() : null,
  endsAt: d.endsAt ? d.endsAt.toISOString() : null,
  price: d.price,
  currency: d.currency,
  coverImage: d.coverImage,
  provider: d.provider ?? "page",
  sourceImage: d.sourceImage ?? null,
  imageReusable: !!d.imageReusable,
  timezone: d.timezone ?? "",
  eventId: d.eventId ? String(d.eventId) : null,
  createdAt: d.createdAt.toISOString(),
});

export async function listDrafts(status: IEventDraft["status"]): Promise<DraftDTO[]> {
  const rows = await EventDraft.find({ status })
    .sort(status === "pending" ? { startsAt: 1 } : { updatedAt: -1 })
    .limit(200)
    .lean<IEventDraft[]>();
  return rows.map(toDto);
}

function cleanPatch(p: DraftPatch): Partial<IEventDraft> {
  const set: Partial<IEventDraft> = {};
  if (p.title !== undefined) set.title = p.title.trim().slice(0, 200);
  if (p.description !== undefined) set.description = p.description.slice(0, 4000);
  if (p.interest !== undefined && isInterestId(p.interest)) set.interest = p.interest;
  if (p.organizerName !== undefined) set.organizerName = p.organizerName.trim().slice(0, 120);
  if (p.country !== undefined && getCountry(p.country)) set.country = p.country.toUpperCase();
  if (p.region !== undefined) set.region = p.region;
  if (p.city !== undefined) set.city = slugify(p.city);
  if (p.venue !== undefined) set.venue = p.venue.trim().slice(0, 200);
  if (p.online !== undefined) set.online = !!p.online;
  if (p.startsAt !== undefined) set.startsAt = p.startsAt ? new Date(p.startsAt) : null;
  if (p.endsAt !== undefined) set.endsAt = p.endsAt ? new Date(p.endsAt) : null;
  if (p.price !== undefined && Number.isFinite(p.price) && p.price >= 0) set.price = Math.round(p.price);
  if (p.currency !== undefined && /^[A-Z]{3}$/.test(p.currency.toUpperCase())) set.currency = p.currency.toUpperCase();
  if (p.coverImage !== undefined) set.coverImage = p.coverImage || null;
  return set;
}

export async function updateDraft(id: string, patch: DraftPatch): Promise<DraftDTO> {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { $set: cleanPatch(patch) }, { returnDocument: "after" }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  return toDto(d);
}

/**
 * Publish a draft as a real event, hosted by the approving admin and credited to its organiser, with the
 * source kept as its "More info / tickets" link. It goes into Klique (everyone sees it) unless a community
 * (or group) is chosen.
 */
export async function approveDraft(admin: IUser, id: string, patch: DraftPatch = {}, where: { communitySlug?: string; subSlug?: string } = {}): Promise<{ eventId: string; title: string }> {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { $set: cleanPatch(patch) }, { returnDocument: "after" }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  const input = eventCreateSchema.parse({
    title: d.title,
    description: d.description,
    interest: d.interest,
    country: d.country,
    region: d.region || undefined,
    city: d.city,
    venue: d.venue,
    online: d.online,
    startsAt: d.startsAt?.toISOString(),
    endsAt: d.endsAt ? d.endsAt.toISOString() : null,
    priceNaira: d.price,
    currency: d.currency,
    coverImage: d.coverImage || null,
    ...(where.communitySlug ? { communitySlug: where.communitySlug, subSlug: where.subSlug || undefined } : {}),
  });
  // a reviewed import isn't someone spamming events: the daily posting limit doesn't apply
  const ev = await createEvent(admin, input, { reviewedImport: true });
  await Event.updateOne({ _id: ev.id }, { organizerName: d.organizerName || d.sourceName || null, sourceUrl: d.sourceUrl });
  await EventDraft.updateOne({ _id: d._id }, { status: "approved", eventId: ev.id as unknown as Types.ObjectId, reviewedBy: admin._id });
  return { eventId: ev.id, title: ev.title };
}

export async function rejectDraft(admin: IUser, id: string) {
  const d = await EventDraft.findOneAndUpdate({ _id: id, status: "pending" }, { status: "rejected", reviewedBy: admin._id }).lean<IEventDraft>();
  if (!d) throw notFound("That draft is gone or was already reviewed.");
  return { rejected: true, title: d.title };
}

/** Post (or reject) many drafts at once. Each one stands alone: one failing doesn't stop the rest. */
export async function bulkDrafts(admin: IUser, ids: string[], action: "approve" | "reject", where: { communitySlug?: string; subSlug?: string } = {}): Promise<DraftBulkResult> {
  const out: DraftBulkResult = { done: [], failed: [] };
  const titles = new Map((await EventDraft.find({ _id: { $in: ids } }).select("title").lean<{ _id: Types.ObjectId; title: string }[]>()).map((d) => [String(d._id), d.title]));
  for (const id of ids) {
    try {
      if (action === "approve") {
        const r = await approveDraft(admin, id, {}, where);
        out.done.push({ id, title: r.title, eventId: r.eventId });
      } else {
        const r = await rejectDraft(admin, id);
        out.done.push({ id, title: r.title });
      }
    } catch (e) {
      out.failed.push({ id, title: titles.get(id) ?? "", message: (e as Error).message });
    }
  }
  return out;
}

/* ------------------------------ sources ----------------------------- */

const sourceDto = (s: IEventSource): SourceDTO => ({ id: String(s._id), url: s.url, name: s.name, lastRunAt: s.lastRunAt?.toISOString() ?? null, lastFound: s.lastFound, lastError: s.lastError });

export async function listSources(): Promise<SourceDTO[]> {
  return (await EventSource.find().sort({ createdAt: 1 }).lean<IEventSource[]>()).map(sourceDto);
}

export async function addSource(url: string, name: string): Promise<SourceDTO> {
  const u = new URL(checkUrl(url));
  const s = await EventSource.findOneAndUpdate({ url: u.toString() }, { $setOnInsert: { url: u.toString(), name: name.trim().slice(0, 120) || u.hostname.replace(/^www\./, "") } }, { upsert: true, returnDocument: "after" }).lean<IEventSource>();
  return sourceDto(s!);
}

export async function removeSource(id: string): Promise<SourceDTO | null> {
  const s = await EventSource.findOneAndDelete({ _id: id }).lean<IEventSource>();
  return s ? sourceDto(s) : null;
}

/** "Check now": a job over every saved page, anywhere, for the next six months. */
export async function checkSourcesNow(admin: IUser): Promise<FinderRunDTO> {
  if (!(await EventSource.exists({}))) throw badRequest("Add a page first.");
  const from = new Date();
  return runDto(await createRun({ country: "", region: "", city: "", interests: [], from, to: new Date(+from + 180 * DAY), includeSources: true, urls: [] }, admin._id));
}

/* --------------------------- saved searches --------------------------- */

const searchDto = (x: ISavedSearch): SavedSearchDTO => ({ id: String(x._id), name: x.name, country: x.country, region: x.region, city: x.city, interests: x.interests, days: x.days, includeSources: x.includeSources, daily: x.daily, lastRunAt: iso(x.lastRunAt), lastAdded: x.lastAdded });

export async function listSearches(): Promise<SavedSearchDTO[]> {
  return (await SavedSearch.find().sort({ createdAt: 1 }).lean<ISavedSearch[]>()).map(searchDto);
}

export async function saveSearch(admin: IUser, input: { name: string; country: string; region: string; city: string; interests: string[]; days: number; includeSources: boolean }): Promise<SavedSearchDTO> {
  if (!getCountry(input.country)) throw badRequest("Pick a country.");
  if ((await SavedSearch.countDocuments()) >= 20) throw badRequest("You can keep up to 20 saved searches.");
  const doc = await SavedSearch.create({ ...input, country: input.country.toUpperCase(), city: slugify(input.city), interests: input.interests.filter((i) => isInterestId(i)), daily: true, createdBy: admin._id });
  return searchDto(doc.toObject());
}

export async function updateSearch(id: string, patch: { daily?: boolean; name?: string; days?: number }): Promise<SavedSearchDTO> {
  const x = await SavedSearch.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after" }).lean<ISavedSearch>();
  if (!x) throw notFound("That saved search is gone.");
  return searchDto(x);
}

export async function removeSearch(id: string) {
  await SavedSearch.deleteOne({ _id: id });
  return { removed: true };
}

/** Run a saved search now (the same job the cron would start tonight). */
export async function runSearchNow(admin: IUser, id: string): Promise<FinderRunDTO> {
  const x = await SavedSearch.findById(id).lean<ISavedSearch>();
  if (!x) throw notFound("That saved search is gone.");
  const from = new Date();
  await SavedSearch.updateOne({ _id: x._id }, { lastRunAt: new Date() });
  return runDto(await createRun({ country: x.country, region: x.region, city: x.city, interests: x.interests, from, to: new Date(+from + x.days * DAY), includeSources: x.includeSources, urls: [] }, admin._id, "saved", x._id));
}
