/**
 * Delivery helpers for Cloudinary URLs. Anything that isn't a Cloudinary URL (sample files, other links)
 * passes through untouched, so these are safe to call on every image.
 */
const isCloudinary = (url: string) => /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(url);

export interface CdnOptions {
  w?: number;
  h?: number;
  /** "fill" crops to the box, "limit" only shrinks; "face" crops to fill around a face */
  fit?: "fill" | "limit" | "face";
}

/** Same picture, resized and in the best format for the device (WebP/AVIF), cached by the CDN. */
export function cdn(url: string | null | undefined, o: CdnOptions = {}): string {
  if (!url || !isCloudinary(url)) return url ?? "";
  const t = ["f_auto", "q_auto"];
  if (o.w) t.push(`w_${Math.round(o.w)}`);
  if (o.h) t.push(`h_${Math.round(o.h)}`);
  if (o.fit === "fill" || o.fit === "face") t.push("c_fill", ...(o.fit === "face" ? ["g_face"] : ["g_auto"]));
  else if (o.w || o.h) t.push("c_limit");
  return url.replace("/upload/", `/upload/${t.join(",")}/`);
}

/** A still frame from a Cloudinary video, used before it plays. */
export function videoPoster(url: string): string | null {
  if (!isCloudinary(url) || !url.includes("/video/upload/")) return null;
  return url.replace("/video/upload/", "/video/upload/so_0,f_jpg,w_1280,c_limit/").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

/** Optimised video delivery (smaller file, right codec for the device). */
export function videoSrc(url: string): string {
  return isCloudinary(url) ? url.replace("/video/upload/", "/video/upload/f_auto,q_auto/") : url;
}
