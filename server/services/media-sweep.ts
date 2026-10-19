import { cloudinaryAccount, type CloudinaryAccount, type UploadKind } from "../env";
import { Community } from "../models/Community";
import { ChannelMessage } from "../models/Channel";
import { Event } from "../models/Event";
import { Message } from "../models/Message";
import { Post } from "../models/Post";
import { Topic } from "../models/Topic";
import { User } from "../models/User";
import { parseUpload } from "./media.service";

/**
 * The nightly sweep for orphaned uploads. A file reaches Cloudinary the moment someone picks it, so
 * a cancelled form or a picture swapped before saving leaves a file nothing points at. This lists every
 * file in our `klique/` folders, compares it with every URL the database still uses, and deletes the
 * ones nobody uses that are old enough not to belong to a form someone is still filling in.
 *
 * Built to fail safe: if any part of the inventory can't be read, nothing is deleted.
 */

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_RUN = 1000;
const RESOURCES = ["image", "video"] as const;

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

const key = (cloud: string, resource: string, publicId: string) => `${cloud}|${resource}|${publicId}`;

/** Every upload the database still points at, as cloud|resource|publicId keys. */
async function referencedKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (url: string | null | undefined) => {
    const a = url ? parseUpload(url) : null;
    if (a) out.add(key(a.cloudName, a.resource, a.publicId));
  };
  const has = { $regex: "^https://res\\.cloudinary\\.com/" };

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
  return out;
}

/** Our Cloudinary accounts, once each (the three upload kinds may share one). */
function accounts(): CloudinaryAccount[] {
  const kinds: UploadKind[] = ["avatar", "photo", "video"];
  const seen = new Map<string, CloudinaryAccount>();
  for (const a of kinds.map(cloudinaryAccount)) if (a && !seen.has(a.cloudName)) seen.set(a.cloudName, a);
  return [...seen.values()];
}

const auth = (a: CloudinaryAccount) => `Basic ${Buffer.from(`${a.apiKey}:${a.apiSecret}`).toString("base64")}`;

/** Every file under klique/ in one account, for one resource type. */
async function listFiles(a: CloudinaryAccount, resource: (typeof RESOURCES)[number]) {
  const files: { publicId: string; createdAt: number }[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ prefix: "klique/", max_results: "500", ...(cursor ? { next_cursor: cursor } : {}) });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${a.cloudName}/resources/${resource}/upload?${q}`, { headers: { authorization: auth(a) } });
    if (!res.ok) throw new Error(`listing ${a.cloudName}/${resource} failed (${res.status})`);
    const body = (await res.json()) as { resources: { public_id: string; created_at: string }[]; next_cursor?: string };
    for (const r of body.resources) files.push({ publicId: r.public_id, createdAt: Date.parse(r.created_at) });
    cursor = body.next_cursor;
  } while (cursor);
  return files;
}

/** Delete up to 100 files in one call (Cloudinary's limit). */
async function bulkDelete(a: CloudinaryAccount, resource: string, publicIds: string[]) {
  const q = new URLSearchParams({ invalidate: "true" });
  publicIds.forEach((id) => q.append("public_ids[]", id));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${a.cloudName}/resources/${resource}/upload?${q}`, { method: "DELETE", headers: { authorization: auth(a) } });
  if (!res.ok) throw new Error(`delete in ${a.cloudName}/${resource} failed (${res.status})`);
  const body = (await res.json()) as { deleted?: Record<string, string> };
  return Object.values(body.deleted ?? {}).filter((v) => v === "deleted").length;
}

export async function sweepOrphanedUploads({ dryRun, minAgeMs = MIN_AGE_MS }: { dryRun: boolean; minAgeMs?: number }): Promise<SweepResult> {
  const result: SweepResult = { dryRun, scanned: 0, referenced: 0, orphaned: 0, deleted: 0, sample: [], errors: [] };
  const used = await referencedKeys(); // throws (and so deletes nothing) if the database can't be read
  result.referenced = used.size;
  const cutoff = Date.now() - minAgeMs;

  // Inventory everything first: a listing that fails part-way must not lead to deleting from a partial picture.
  const orphans: { account: CloudinaryAccount; resource: string; publicId: string }[] = [];
  for (const account of accounts()) {
    for (const resource of RESOURCES) {
      const files = await listFiles(account, resource);
      result.scanned += files.length;
      for (const f of files) {
        if (f.createdAt > cutoff) continue; // may still be on its way into a form
        if (!used.has(key(account.cloudName, resource, f.publicId))) orphans.push({ account, resource, publicId: f.publicId });
      }
    }
  }
  result.orphaned = orphans.length;
  result.sample = orphans.slice(0, 10).map((o) => `${o.resource}/${o.publicId}`);
  if (dryRun) return result;

  const batch = orphans.slice(0, MAX_DELETES_PER_RUN);
  const groups = new Map<string, typeof batch>();
  for (const o of batch) {
    const g = `${o.account.cloudName}|${o.resource}`;
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      try {
        result.deleted += await bulkDelete(chunk[0].account, chunk[0].resource, chunk.map((o) => o.publicId));
      } catch (e) {
        result.errors.push((e as Error).message);
      }
    }
  }
  return result;
}
