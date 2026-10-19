import "server-only";
import { after } from "next/server";
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

/** Delete these uploads once the response is on its way. Foreign URLs are skipped. */
export function deleteUploads(urls: (string | null | undefined)[]) {
  const keys = [...new Set(urls.filter((u): u is string => !!u).map((u) => keyFromUrl(u)).filter((k): k is string => !!k).flatMap(variantKeys))];
  if (!keys.length) return;
  const run = async () => {
    await Promise.all(keys.map((k) => deleteObject(k).catch((err: unknown) => console.warn("[media] delete failed:", k, (err as Error)?.message))));
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts)
  }
}
