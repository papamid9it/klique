import "server-only";
import { after } from "next/server";
import { ChannelMessage } from "../models/Channel";
import { CrewMessage } from "../models/Crew";
import { Message } from "../models/Message";
import { SavedSticker } from "../models/SavedSticker";
import { deleteObject, keyFromUrl } from "./r2";

/**
 * Deleting our own uploads from R2 once nothing points at them any more (a replaced profile picture or banner,
 * the photos and videos of a deleted message). Each upload's small copy and still frame go with it.
 *
 * Only files under our R2 public address AND inside `klique/` are touched, so sample pictures, other people's
 * links and old Cloudinary links are left alone. Fire-and-forget: a failed delete never fails the request that
 * caused it; the nightly sweep picks up anything left behind.
 */

/** "klique/photos/2026-10/abc_sm.webp" → "klique/photos/2026-10/abc": one upload, whatever the variant. */
export const uploadBase = (key: string) => key.replace(/(_sm|_poster)?\.[a-z0-9]+$/i, "");

/** The upload a URL belongs to, or null when it isn't one of ours. */
export function parseUpload(url: string): { key: string; base: string } | null {
  const key = keyFromUrl(url);
  return key ? { key, base: uploadBase(key) } : null;
}

/** Every file one upload may have: the original plus its small copy or still frame. */
export function variantKeys(key: string): string[] {
  const base = uploadBase(key);
  if (key.includes("/videos/")) return [key, `${base}_poster.webp`, `${base}_poster.jpg`];
  return [key, `${base}_sm.webp`, `${base}_sm.jpg`];
}

/** Of these links, the ones someone still uses as a sticker (saved, or sent in a chat). */
export async function stillStickers(urls: string[]): Promise<Set<string>> {
  if (!urls.length) return new Set();
  const q = { $in: urls };
  const [saved, dms, channel, crew] = await Promise.all([
    SavedSticker.distinct("url", { url: q }),
    Message.distinct("stickerUrl", { stickerUrl: q, deletedAt: null }),
    ChannelMessage.distinct("stickerUrl", { stickerUrl: q, deletedAt: null }),
    CrewMessage.distinct("stickerUrl", { stickerUrl: q }),
  ]);
  return new Set([...saved, ...dms, ...channel, ...crew].map(String));
}

/**
 * Delete these uploads once the response is on its way. Foreign URLs are skipped, and so are pictures someone
 * saved or sent as a sticker (deleting the message they came from leaves the sticker working), unless `force`
 * (a moderator removing something): then the stickers made from it go too.
 */
export function deleteUploads(urls: (string | null | undefined)[], opts: { force?: boolean } = {}) {
  const ours = [...new Set(urls.filter((u): u is string => !!u).map((u) => u.split("#")[0]).filter((u) => !!keyFromUrl(u)))];
  if (!ours.length) return;
  const run = async () => {
    let gone = ours;
    if (opts.force) await SavedSticker.deleteMany({ url: { $in: ours } }).catch(() => undefined);
    else {
      const kept = await stillStickers(ours).catch(() => new Set(ours)); // can't tell: keep them all (the nightly sweep decides later)
      gone = ours.filter((u) => !kept.has(u));
    }
    const keys = [...new Set(gone.map((u) => keyFromUrl(u)!).flatMap(variantKeys))];
    await Promise.all(keys.map((k) => deleteObject(k).catch((err: unknown) => console.warn("[media] delete failed:", k, (err as Error)?.message))));
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts)
  }
}
