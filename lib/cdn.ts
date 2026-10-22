/**
 * Delivery helpers for uploaded pictures and videos. Uploads live in Cloudflare R2 at NEXT_PUBLIC_MEDIA_URL
 * (set from R2_PUBLIC_URL at build time). Every photo is stored twice, full size and a 640px copy
 * ("…_sm.webp"); videos have a still frame next to them ("…_poster.webp"). Anything that isn't one of our
 * uploads (sample files, other links, old Cloudinary links) passes through untouched.
 */
import { isDataSaver } from "./data-saver";

const MEDIA = (process.env.NEXT_PUBLIC_MEDIA_URL ?? "").replace(/\/$/, "");
const isOurs = (url: string) => !!MEDIA && url.startsWith(`${MEDIA}/klique/`);

export interface CdnOptions {
  w?: number;
  h?: number;
  /** kept for callers; pictures are already cropped and sized when they're uploaded */
  fit?: "fill" | "limit" | "face";
  /** the full picture even with data saver on (the fullscreen viewer, which you opened on purpose) */
  full?: boolean;
}

const SMALL_ENOUGH = 720;

/** The best stored copy for the size it's shown at: the 640px copy for thumbnails, the full picture otherwise. */
export function cdn(link: string | null | undefined, o: CdnOptions = {}): string {
  if (!link) return "";
  const url = link.split("#")[0]; // a saved position (lib/focal) is applied by the component, not the file

  if (!isOurs(url) || !url.includes("/klique/photos/")) return url;
  // data saver: the 640px copy everywhere a picture is part of the page
  const box = !o.full && isDataSaver() ? SMALL_ENOUGH : Math.max(o.w ?? 0, o.h ?? 0);
  // GIFs keep their animation and have no small copy
  if (box && box <= SMALL_ENOUGH && /\.(webp|jpg)$/i.test(url) && !/_sm\.(webp|jpg)$/i.test(url)) return url.replace(/\.(webp|jpg)$/i, "_sm.$1");
  return url;
}

/** The still frame stored next to one of our videos. */
export function videoPoster(url: string): string | null {
  if (!isOurs(url) || !url.includes("/klique/videos/")) return null;
  return url.replace(/\.(mp4|webm)$/i, "_poster.webp");
}

/** Videos are already compressed on upload. */
export function videoSrc(url: string): string {
  return url;
}
