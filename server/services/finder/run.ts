import "server-only";
import type { Types } from "mongoose";
import { cityName, getCityEntry, regionName } from "@/lib/places";
import { eventbriteToken, ticketmasterKey } from "../../env";
import { Event } from "../../models/Event";
import { EventDraft, EventSource, FinderRun, SavedSearch, type IEventSource, type IFinderQuery, type IFinderRun, type IFinderTask } from "../../models/EventDraft";
import { getCategories } from "../categories.service";
import { assertScrapable, politeFetch } from "./http";
import { cityInText, feedLinks, fromIcs, fromSchemaOrg, isEvent, itemListLinks, jsonLd, looksLikeFeed, looksLikeIcs, microdata, siteNameOf, type Candidate } from "./parse";
import { eventbriteOrgId, eventbriteOrganizer, ticketmaster } from "./providers";

/**
 * The finder's job runner. "Find events" only records a job (a FinderRun with one task per source); the work
 * happens in small steps, one source fetch per task, each fetch capped at 8 seconds. The admin page asks for
 * the next step while it's open; the nightly cron finishes anything left. Nothing here ever runs inside a
 * normal visitor's request, so the site stays as fast as it was.
 */

const MAX_TASKS = 60;
const MAX_FOLLOW = 15;
const MAX_ADDED = 150;
/** a task stuck "running" this long (a request that died) is tried again */
const STALE_MS = 2 * 60_000;

/* ------------------------------ categories ------------------------------ */

const KEYWORDS: Record<string, RegExp> = {
  skate: /\bskat(e|ing|eboard)/i,
  running: /\b(run|running|marathon|5k|10k|jog|race)\b/i,
  photography: /\b(photo|photography|photowalk|camera)/i,
  film: /\b(film|cinema|movie|screening)/i,
  dance: /\b(dance|dancing|choreograph|ballet)/i,
  streetwear: /\b(streetwear|fashion|thrift|sneaker|pop-?up shop)/i,
  art: /\b(art|arts|exhibition|gallery|painting|museum)\b/i,
  music: /\b(music|concert|gig|live|dj|band|afrobeats|amapiano|festival|party|rave)\b/i,
  comedy: /\b(comedy|stand-?up|comedian)/i,
  tech: /\b(tech|developer|startup|hackathon|ai|coding)\b/i,
  food: /\b(food|brunch|dinner|tasting|chef|market)\b/i,
  sports: /\b(football|basketball|match|tournament|sports?)\b/i,
};

/** The admin's category this looks like: their keywords first, then the category's own name in the text. */
async function categoryGuesser() {
  const cats = (await getCategories()).filter((c) => !c.hidden);
  return (text: string): string | null => {
    for (const c of cats) if (KEYWORDS[c.id]?.test(text)) return c.id;
    const t = text.toLowerCase();
    for (const c of cats) if ([c.name, c.short].some((n) => n && new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) return c.id;
    return null;
  };
}

/* -------------------------------- dedupe -------------------------------- */

const STOP = new Set(["the", "a", "an", "and", "of", "at", "in", "on", "for", "with", "to", "live", "presents", "ft", "feat", "edition", "2025", "2026", "2027"]);
export const words = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

const similar = (a: string, b: string) => {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return false;
  const both = [...A].filter((w) => B.has(w)).length;
  return both / new Set([...A, ...B]).size >= 0.6;
};

const dayIn = (d: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
export const dedupeKeyOf = (c: Pick<Candidate, "title" | "startsAt" | "timezone" | "country">) => `${c.country}|${dayIn(c.startsAt, c.timezone || "UTC")}|${words(c.title).slice(0, 6).sort().join(" ")}`;

/** Already known: the same page, the same key, or a similar title on the same day (drafts of any status, and live events). */
async function isDuplicate(c: Candidate, key: string): Promise<boolean> {
  if (await EventDraft.exists({ $or: [{ sourceUrl: c.sourceUrl }, { dedupeKey: key }] })) return true;
  const near = { $gte: new Date(+c.startsAt - 18 * 3600_000), $lte: new Date(+c.startsAt + 18 * 3600_000) };
  const [drafts, events] = await Promise.all([EventDraft.find({ startsAt: near }).select("title").limit(200).lean<{ title: string }[]>(), Event.find({ startsAt: near, country: c.country }).select("title").limit(200).lean<{ title: string }[]>()]);
  return [...drafts, ...events].some((x) => similar(x.title, c.title));
}

/* ------------------------------- filtering ------------------------------- */

function inPlace(c: Candidate, q: IFinderQuery): boolean {
  if (!q.country) return true;
  if (c.country !== q.country) return false;
  if (q.city) {
    if (c.online) return false;
    if (c.city === q.city) return true;
    const name = cityName(q.country, q.city).toLowerCase();
    return cityInText(q.country, `${c.placeText}, ${c.venue}`)?.city === q.city || `${c.placeText} ${c.venue}`.toLowerCase().includes(name);
  }
  if (q.region) return c.region === q.region || getCityEntry(q.country, c.city)?.region === q.region || `${c.placeText}`.toLowerCase().includes(regionName(q.country, q.region).toLowerCase());
  return true;
}

/* ------------------------------- the runner ------------------------------- */

export async function createRun(query: IFinderQuery, createdBy: Types.ObjectId | null, trigger: IFinderRun["trigger"] = "admin", savedSearchId: Types.ObjectId | null = null): Promise<IFinderRun> {
  const tasks: Partial<IFinderTask>[] = [];
  // Ticketmaster needs a country to search in (a pasted link or the nightly page check has none)
  if (ticketmasterKey() && query.country) tasks.push({ kind: "ticketmaster", target: query.city || query.region || query.country, label: "Ticketmaster" });
  const addLink = (url: string, label: string, kind: "source" | "url", target = url) => {
    const org = eventbriteOrgId(url);
    if (org) tasks.push(eventbriteToken() ? { kind: "eventbrite", target: org, label: `Eventbrite organiser ${org}` } : { kind: "eventbrite", target: org, label: `Eventbrite organiser ${org}`, status: "failed", note: "Add EVENTBRITE_TOKEN to read Eventbrite organisers" });
    else tasks.push({ kind, target, label });
  };
  if (query.includeSources) for (const s of await EventSource.find().sort({ createdAt: 1 }).lean<IEventSource[]>()) addLink(s.url, s.name, "source", String(s._id));
  for (const u of query.urls) addLink(u, new URL(u).hostname.replace(/^www\./, ""), "url");
  const run = await FinderRun.create({ query, savedSearchId, trigger, createdBy, tasks: tasks.slice(0, MAX_TASKS), status: tasks.some((t) => !t.status) ? "running" : "done", finishedAt: tasks.some((t) => !t.status) ? null : new Date() });
  return run.toObject();
}

/** Claim the next task (or one left "running" by a request that died). */
async function claim(runId: Types.ObjectId | string): Promise<{ run: IFinderRun; i: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const run = await FinderRun.findById(runId).lean<IFinderRun>();
    if (!run || run.status !== "running") return null;
    const i = run.tasks.findIndex((t) => t.status === "pending" || (t.status === "running" && t.startedAt && Date.now() - +t.startedAt > STALE_MS));
    if (i < 0) {
      if (!run.tasks.some((t) => t.status === "running")) await finish(run);
      return null;
    }
    const res = await FinderRun.updateOne({ _id: run._id, [`tasks.${i}.status`]: run.tasks[i].status, [`tasks.${i}.startedAt`]: run.tasks[i].startedAt }, { $set: { [`tasks.${i}.status`]: "running", [`tasks.${i}.startedAt`]: new Date() } });
    if (res.modifiedCount) return { run, i };
  }
  return null;
}

async function finish(run: IFinderRun) {
  const res = await FinderRun.updateOne({ _id: run._id, status: "running" }, { status: "done", finishedAt: new Date() });
  if (res.modifiedCount && run.savedSearchId) await SavedSearch.updateOne({ _id: run.savedSearchId }, { lastRunAt: new Date(), lastAdded: run.added });
}

/** What one task finds: events, and (for listings and feeds) more pages to read as their own tasks. */
async function work(run: IFinderRun, task: IFinderTask): Promise<{ events: Candidate[]; follow: string[]; source?: IEventSource | null }> {
  const q = run.query;
  if (task.kind === "ticketmaster") return { events: await ticketmaster({ ...q }, q.city ? cityName(q.country, q.city) : ""), follow: [] };
  if (task.kind === "eventbrite") return { events: await eventbriteOrganizer(task.target, q.country), follow: [] };
  const source = task.kind === "source" ? await EventSource.findById(task.target).lean<IEventSource>() : null;
  const url = source?.url ?? task.target;
  assertScrapable(new URL(url));
  const page = await politeFetch(url);
  if (looksLikeIcs(page.type, page.body)) return { events: fromIcs(page.body, page.url, q.country), follow: [], source };
  if (looksLikeFeed(page.type, page.body)) return { events: [], follow: task.kind === "follow" ? [] : feedLinks(page.body, page.url), source };
  const site = siteNameOf(page.body, page.url);
  const objects = [...jsonLd(page.body), ...microdata(page.body)];
  const events = objects
    .filter(isEvent)
    .map((o) => fromSchemaOrg(o, page.url, site, q.country))
    .filter((c): c is Candidate => !!c)
    .map((c) => (task.kind === "url" || task.kind === "follow" ? { ...c, provider: c.provider } : c));
  // a listings page: read the event pages it links to (one task each), but don't crawl further from those
  const follow = !events.length && task.kind !== "follow" ? itemListLinks(objects).map((l) => new URL(l, page.url).toString()) : [];
  return { events, follow, source };
}

/** Run tasks until about `budgetMs` has passed (one at a time). Returns the run as it stands. */
export async function stepRun(runId: Types.ObjectId | string, budgetMs = 15_000): Promise<IFinderRun | null> {
  const until = Date.now() + budgetMs;
  const guess = await categoryGuesser();
  while (Date.now() < until) {
    const claimed = await claim(runId);
    if (!claimed) break;
    const { run, i } = claimed;
    const task = run.tasks[i];
    const inc = { found: 0, added: 0, duplicates: 0, filtered: 0 };
    let note = "";
    let failed = false;
    const push: Partial<IFinderTask>[] = [];
    try {
      const { events, follow, source } = await work(run, task);
      inc.found = events.length;
      const room = MAX_TASKS - run.tasks.length;
      const known = new Set(run.tasks.map((t) => t.target));
      for (const link of [...new Set(follow)].filter((l) => !known.has(l)).slice(0, Math.min(MAX_FOLLOW, Math.max(0, room)))) push.push({ kind: "follow", target: link, label: new URL(link).pathname.slice(0, 80) || link });
      const now = Date.now();
      for (const c of events) {
        if (run.added + inc.added >= MAX_ADDED) {
          note = `Stopped at ${MAX_ADDED} new events for this run`;
          break;
        }
        if (+c.startsAt < now || c.startsAt < run.query.from || c.startsAt > run.query.to || !inPlace(c, run.query)) {
          inc.filtered++;
          continue;
        }
        const interest = guess(c.categoryText);
        if (run.query.interests.length && (!interest || !run.query.interests.includes(interest))) {
          inc.filtered++;
          continue;
        }
        const key = dedupeKeyOf(c);
        if (await isDuplicate(c, key)) {
          inc.duplicates++;
          continue;
        }
        const res = await EventDraft.updateOne(
          { sourceUrl: c.sourceUrl },
          {
            $setOnInsert: {
              status: "pending",
              sourceUrl: c.sourceUrl,
              sourceName: c.sourceName,
              title: c.title,
              description: c.description,
              interest: interest ?? run.query.interests[0] ?? "music",
              organizerName: c.organizerName,
              country: c.country,
              region: c.region || getCityEntry(c.country, c.city)?.region || "",
              city: c.city,
              venue: c.venue,
              online: c.online,
              startsAt: c.startsAt,
              endsAt: c.endsAt,
              price: c.price,
              currency: c.currency,
              // only an official API's picture is used as the cover; a scraped page's stays a reference for the reviewer
              coverImage: c.imageReusable ? c.image : null,
              sourceImage: c.image,
              imageReusable: c.imageReusable,
              provider: c.provider,
              timezone: c.timezone,
              dedupeKey: key,
              runId: run._id,
            },
          },
          { upsert: true },
        );
        if (res.upsertedCount) inc.added++;
        else inc.duplicates++;
      }
      if (push.length) note = note || `Reading ${push.length} linked ${push.length === 1 ? "page" : "pages"}`;
      if (source) await EventSource.updateOne({ _id: source._id }, { lastRunAt: new Date(), lastFound: events.length, lastError: "" });
    } catch (e) {
      failed = true;
      note = ((e as Error).message || "Failed").slice(0, 300);
      if (task.kind === "source") await EventSource.updateOne({ _id: task.target }, { lastRunAt: new Date(), lastError: note });
    }
    await FinderRun.updateOne(
      { _id: run._id },
      {
        $set: { [`tasks.${i}.status`]: failed ? "failed" : "done", [`tasks.${i}.found`]: inc.found, [`tasks.${i}.added`]: inc.added, [`tasks.${i}.note`]: note },
        $inc: { found: inc.found, added: inc.added, duplicates: inc.duplicates, filtered: inc.filtered },
      },
    );
    // (a separate update: Mongo won't set one task and append to the same list at once)
    if (push.length) await FinderRun.updateOne({ _id: run._id }, { $push: { tasks: { $each: push } } });
    const after = await FinderRun.findById(run._id).select("added").lean<{ added: number }>();
    if ((after?.added ?? 0) >= MAX_ADDED) {
      await FinderRun.updateOne({ _id: run._id }, { $set: { "tasks.$[t].status": "done", "tasks.$[t].note": "Skipped: this run already found plenty" } }, { arrayFilters: [{ "t.status": "pending" }] });
    }
  }
  const latest = await FinderRun.findById(runId).lean<IFinderRun>();
  if (latest?.status === "running" && !latest.tasks.some((t) => t.status === "pending" || t.status === "running")) await finish(latest);
  return FinderRun.findById(runId).lean<IFinderRun>();
}

/* ------------------------------ nightly work ------------------------------ */

const DAY = 86_400_000;

/**
 * The cron's share: start tonight's run for each daily saved search that hasn't run in the last 20 hours (one
 * new run per call, so searches go one at a time), then work through unfinished runs until the time is up.
 */
export async function cronFinder(budgetMs = 240_000): Promise<{ started: number; steps: number; running: number }> {
  const until = Date.now() + budgetMs;
  let started = 0;
  const busy = await FinderRun.exists({ status: "running", savedSearchId: { $ne: null } });
  if (!busy) {
    const due = await SavedSearch.findOne({ daily: true, $or: [{ lastRunAt: null }, { lastRunAt: { $lt: new Date(Date.now() - 20 * 3600_000) } }] }).sort({ lastRunAt: 1 }).lean();
    if (due) {
      const from = new Date();
      await createRun({ country: due.country, region: due.region, city: due.city, interests: due.interests, from, to: new Date(+from + due.days * DAY), includeSources: due.includeSources, urls: [] }, due.createdBy, "saved", due._id);
      await SavedSearch.updateOne({ _id: due._id }, { lastRunAt: new Date() });
      started++;
    }
  }
  // and once a night, the saved pages on their own (anywhere, the next six months), as the finder always did
  if (!started && (await EventSource.exists({})) && !(await FinderRun.exists({ trigger: "nightly", createdAt: { $gt: new Date(Date.now() - 20 * 3600_000) } }))) {
    const from = new Date();
    await createRun({ country: "", region: "", city: "", interests: [], from, to: new Date(+from + 180 * DAY), includeSources: true, urls: [] }, null, "nightly");
    started++;
  }
  let steps = 0;
  for (;;) {
    const left = until - Date.now();
    if (left < 20_000) break;
    const run = await FinderRun.findOne({ status: "running" }).sort({ createdAt: 1 }).select("_id").lean<{ _id: Types.ObjectId }>();
    if (!run) break;
    await stepRun(run._id, Math.min(left - 15_000, 60_000));
    steps++;
  }
  return { started, steps, running: await FinderRun.countDocuments({ status: "running" }) };
}
