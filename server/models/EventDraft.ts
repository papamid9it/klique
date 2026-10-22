import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "./define";
import { type InterestId } from "@/lib/constants";

/**
 * An event found on another site (pasted by an admin or picked up from a source page), waiting in the
 * admin inbox. Nothing here is visible to anyone else: approving it creates a real Event.
 */
export interface IEventDraft {
  _id: Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  /** the event's own page; one draft per page */
  sourceUrl: string;
  sourceName: string;
  title: string;
  description: string;
  interest: InterestId;
  organizerName: string;
  country: string;
  region: string;
  city: string;
  venue: string;
  online: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  price: number;
  currency: string;
  coverImage: string | null;
  /** where it came from: an event page, a calendar, a feed, or an official API */
  provider: "page" | "ical" | "rss" | "ticketmaster" | "eventbrite" | "link";
  /** the picture the source shows; only used as the cover when the source allows reuse (official APIs) */
  sourceImage: string | null;
  imageReusable: boolean;
  /** the time zone the source gave its times in */
  timezone: string;
  /** same title-ish + day + venue: catches the same event found again elsewhere (rejected ones too) */
  dedupeKey: string;
  /** the finder run that found it */
  runId: Types.ObjectId | null;
  eventId: Types.ObjectId | null;
  reviewedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const EventDraftSchema = new Schema<IEventDraft>(
  {
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    sourceUrl: { type: String, required: true, unique: true, maxlength: 1000 },
    sourceName: { type: String, default: "", maxlength: 120 },
    title: { type: String, default: "", maxlength: 200 },
    description: { type: String, default: "", maxlength: 4000 },
    interest: { type: String, default: "music" },
    organizerName: { type: String, default: "", maxlength: 120 },
    country: { type: String, default: "NG" },
    region: { type: String, default: "" },
    city: { type: String, default: "" },
    venue: { type: String, default: "", maxlength: 200 },
    online: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
    coverImage: { type: String, default: null },
    provider: { type: String, enum: ["page", "ical", "rss", "ticketmaster", "eventbrite", "link"], default: "page" },
    sourceImage: { type: String, default: null, maxlength: 1000 },
    imageReusable: { type: Boolean, default: false },
    timezone: { type: String, default: "" },
    dedupeKey: { type: String, default: "" },
    runId: { type: Schema.Types.ObjectId, default: null },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);
EventDraftSchema.index({ status: 1, startsAt: 1 });
EventDraftSchema.index({ dedupeKey: 1 });

export const EventDraft: Model<IEventDraft> = defineModel<IEventDraft>("EventDraft", EventDraftSchema);

/** A page the nightly finder checks for events (a venue's or ticket site's listings page). */
export interface IEventSource {
  _id: Types.ObjectId;
  url: string;
  name: string;
  lastRunAt: Date | null;
  lastFound: number;
  lastError: string;
  createdAt: Date;
}

const EventSourceSchema = new Schema<IEventSource>(
  {
    url: { type: String, required: true, unique: true, maxlength: 1000 },
    name: { type: String, default: "", maxlength: 120 },
    lastRunAt: { type: Date, default: null },
    lastFound: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const EventSource: Model<IEventSource> = defineModel<IEventSource>("EventSource", EventSourceSchema);

/* ------------------------------- finder runs ------------------------------- */

/** What to look for. Saved searches keep a window ("the next 30 days") instead of fixed dates. */
export interface IFinderQuery {
  country: string;
  region: string;
  city: string;
  /** categories to keep (empty: all) */
  interests: string[];
  from: Date;
  to: Date;
  /** also check the pages/calendars/feeds saved in the admin */
  includeSources: boolean;
  /** one-off links for this run */
  urls: string[];
}

export type FinderTaskKind = "ticketmaster" | "eventbrite" | "source" | "url" | "follow";
export interface IFinderTask {
  kind: FinderTaskKind;
  /** a URL, a source id, or an organiser id */
  target: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  found: number;
  added: number;
  note: string;
  startedAt: Date | null;
}

/**
 * One "Find events" job. It is worked through a step at a time (one source fetched per step), driven by the
 * admin page while it's open and by the nightly cron otherwise, so no single request ever does much.
 */
export interface IFinderRun {
  _id: Types.ObjectId;
  query: IFinderQuery;
  savedSearchId: Types.ObjectId | null;
  /** who asked: an admin's search, a saved search at night, or the nightly check of the saved pages */
  trigger: "admin" | "saved" | "nightly";
  status: "running" | "done" | "failed";
  tasks: IFinderTask[];
  found: number;
  added: number;
  duplicates: number;
  /** found but outside the place, dates or categories asked for */
  filtered: number;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  finishedAt: Date | null;
}

const QuerySchema = new Schema<IFinderQuery>(
  {
    // "" = anywhere (a pasted link, the nightly check of saved pages)
    country: { type: String, default: "" },
    region: { type: String, default: "" },
    city: { type: String, default: "" },
    interests: { type: [String], default: [] },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    includeSources: { type: Boolean, default: true },
    urls: { type: [String], default: [] },
  },
  { _id: false },
);

const TaskSchema = new Schema<IFinderTask>(
  {
    kind: { type: String, enum: ["ticketmaster", "eventbrite", "source", "url", "follow"], required: true },
    target: { type: String, required: true, maxlength: 1000 },
    label: { type: String, default: "", maxlength: 200 },
    status: { type: String, enum: ["pending", "running", "done", "failed"], default: "pending" },
    found: { type: Number, default: 0 },
    added: { type: Number, default: 0 },
    note: { type: String, default: "", maxlength: 300 },
    startedAt: { type: Date, default: null },
  },
  { _id: false },
);

const FinderRunSchema = new Schema<IFinderRun>(
  {
    query: { type: QuerySchema, required: true },
    savedSearchId: { type: Schema.Types.ObjectId, default: null },
    trigger: { type: String, enum: ["admin", "saved", "nightly"], default: "admin" },
    status: { type: String, enum: ["running", "done", "failed"], default: "running" },
    tasks: { type: [TaskSchema], default: [] },
    found: { type: Number, default: 0 },
    added: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    filtered: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
FinderRunSchema.index({ status: 1, createdAt: 1 });

export const FinderRun: Model<IFinderRun> = defineModel<IFinderRun>("FinderRun", FinderRunSchema);

/** A search the cron re-runs every night (results only go to the review queue, never straight live). */
export interface ISavedSearch {
  _id: Types.ObjectId;
  name: string;
  country: string;
  region: string;
  city: string;
  interests: string[];
  /** how far ahead to look each night */
  days: number;
  includeSources: boolean;
  daily: boolean;
  lastRunAt: Date | null;
  lastAdded: number;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
}

const SavedSearchSchema = new Schema<ISavedSearch>(
  {
    name: { type: String, default: "", maxlength: 80 },
    country: { type: String, default: "NG" },
    region: { type: String, default: "" },
    city: { type: String, default: "" },
    interests: { type: [String], default: [] },
    days: { type: Number, default: 30, min: 1, max: 180 },
    includeSources: { type: Boolean, default: true },
    daily: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    lastAdded: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const SavedSearch: Model<ISavedSearch> = defineModel<ISavedSearch>("SavedSearch", SavedSearchSchema);
