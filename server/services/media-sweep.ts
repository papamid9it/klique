import { Ad } from "../models/Ad";
import { Community } from "../models/Community";
import { CrewMessage } from "../models/Crew";
import { SavedSticker } from "../models/SavedSticker";
import { EventDraft } from "../models/EventDraft";
import { ChannelMessage } from "../models/Channel";
import { Event } from "../models/Event";
import { Message } from "../models/Message";
import { Post } from "../models/Post";
import { Topic } from "../models/Topic";
import { User } from "../models/User";
import { parseUpload, uploadBase } from "./media.service";
import { deleteObject, listObjects } from "./r2";
import { r2Config } from "../env";

/**
 * The nightly sweep for orphaned uploads. A file reaches R2 the moment someone picks it, so
 * a cancelled form or a picture swapped before saving leaves a file nothing points at. This lists every
 * file in our `klique/` folders, compares it with every URL the database still uses, and deletes the
 * ones nobody uses that are old enough not to belong to a form someone is still filling in.
 *
 * Built to fail safe: if any part of the inventory can't be read, nothing is deleted.
 */

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_RUN = 1000;

export interface SweepResult {
  dryRun: boolean;
  scanned: number;
  referenced: number;
  orphaned: number;
  deleted: number;
  /** a few of the orphans, for checking a dry run by eye */
  sample: string[];
  errors: string[];
}

/** Every upload the database still points at, as base keys (one per upload, whatever its variants). */
async function referencedKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (url: string | null | undefined) => {
    const a = url ? parseUpload(url) : null;
    if (a) out.add(a.base);
  };
  const base = r2Config()?.publicUrl ?? "";
  const has = { $regex: `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` };

  for await (const u of User.find({ $or: [{ avatarUrl: has }, { bannerUrl: has }] }).select("avatarUrl bannerUrl").lean().cursor()) {
    add(u.avatarUrl);
    add(u.bannerUrl);
  }
  for await (const c of Community.find({ coverImage: has }).select("coverImage").lean().cursor()) add(c.coverImage);
  for await (const e of Event.find({ coverImage: has }).select("coverImage").lean().cursor()) add(e.coverImage);
  for await (const p of Post.find({ imageUrl: has }).select("imageUrl").lean().cursor()) add(p.imageUrl);
  for await (const t of Topic.find({ $or: [{ imageUrl: has }, { "media.0": { $exists: true } }] }).select("imageUrl media").lean().cursor()) {
    add(t.imageUrl);
    for (const m of t.media ?? []) {
      add(m.url);
      add(m.poster);
    }
  }
  for await (const m of ChannelMessage.find({ "images.0": { $exists: true } }).select("images").lean().cursor()) m.images.forEach(add);
  for await (const m of Message.find({ "images.0": { $exists: true } }).select("images").lean().cursor()) m.images.forEach(add);
  // stickers: saved ones, and ones sent in chats (the message they were taken from may be long gone)
  for await (const s of SavedSticker.find().select("url").lean().cursor()) add(s.url);
  for await (const m of ChannelMessage.find({ stickerUrl: has }).select("stickerUrl").lean().cursor()) add(m.stickerUrl);
  for await (const m of Message.find({ stickerUrl: has }).select("stickerUrl").lean().cursor()) add(m.stickerUrl);
  for await (const m of CrewMessage.find({ stickerUrl: has }).select("stickerUrl").lean().cursor()) add(m.stickerUrl);
  for await (const m of CrewMessage.find({ "images.0": { $exists: true } }).select("images").lean().cursor()) (m.images ?? []).forEach(add);
  for await (const a of Ad.find({ imageUrl: has }).select("imageUrl").lean().cursor()) add(a.imageUrl);
  for await (const d of EventDraft.find({ coverImage: has }).select("coverImage").lean().cursor()) add(d.coverImage);
  return out;
}

export async function sweepOrphanedUploads({ dryRun, minAgeMs = MIN_AGE_MS }: { dryRun: boolean; minAgeMs?: number }): Promise<SweepResult> {
  const result: SweepResult = { dryRun, scanned: 0, referenced: 0, orphaned: 0, deleted: 0, sample: [], errors: [] };
  const used = await referencedKeys(); // throws (and so deletes nothing) if the database can't be read
  result.referenced = used.size;
  const cutoff = Date.now() - minAgeMs;

  // Inventory everything first: a listing that fails part-way must not lead to deleting from a partial picture.
  if (!r2Config()) return result;
  const files = await listObjects("klique/");
  result.scanned = files.length;
  const orphans = files.filter((f) => f.lastModified <= cutoff && !used.has(uploadBase(f.key)));
  result.orphaned = orphans.length;
  result.sample = orphans.slice(0, 10).map((o) => o.key);
  if (dryRun) return result;

  for (const o of orphans.slice(0, MAX_DELETES_PER_RUN)) {
    try {
      await deleteObject(o.key);
      result.deleted++;
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  return result;
}
