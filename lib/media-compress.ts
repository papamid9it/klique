"use client";

import { MEDIA_LIMITS, UPLOAD_SPECS, type UploadKind } from "./uploads";

/**
 * Shrinks and compresses pictures and videos on the device, before anything is uploaded. Storage (Cloudflare R2)
 * keeps files exactly as sent, so this is where sizes are decided:
 *  - profile pictures: a 512×512 square, cropped from the centre
 *  - photos: at most 1920px on the long edge, plus a 640px copy for thumbnails
 *  - videos: at most 1280px on the long edge (720p), re-encoded as H.264 MP4 (VP9 WebM where the browser can't
 *    make H.264), plus a still frame to show before it plays
 * Pictures become WebP (JPEG where the browser can't make WebP). Animated GIFs are kept as they are.
 */

export interface Compressed {
  files: { variant: "main" | "sm" | "poster"; blob: Blob }[];
  width: number | null;
  height: number | null;
  duration: number | null;
}

export class CompressError extends Error {}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function encode(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  const as = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  const webp = await as("image/webp", quality);
  // browsers that can't encode WebP quietly hand back a PNG instead
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await as("image/jpeg", 0.85);
  if (!jpeg) throw new CompressError("Couldn't process that picture.");
  return jpeg;
}

function draw(src: CanvasImageSource, sw: number, sh: number, box: { w: number; h: number; crop?: boolean }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  let sx = 0,
    sy = 0,
    cw = sw,
    ch = sh;
  if (box.crop) {
    // centre square
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    cw = ch = side;
  }
  const scale = Math.min(1, box.w / cw, box.h / ch); // never enlarge
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CompressError("This browser can't process pictures.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function compressImage(kind: Exclude<UploadKind, "video">, file: Blob & { name?: string }): Promise<Compressed> {
  if (file.type === "image/gif") {
    // keep animation: no resizing, just the size check the server also does
    const max = UPLOAD_SPECS[kind].variants.main!.maxBytes;
    if (file.size > max) throw new CompressError(`GIFs can be up to ${Math.round(max / 1024 / 1024)} MB.`);
    return { files: [{ variant: "main", blob: file }], width: null, height: null, duration: null };
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new CompressError(/heic|heif/i.test(file.name ?? file.type) ? "This browser can't open HEIC photos. Export it as JPG first, or use Safari." : "Couldn't open that picture. Try a JPG, PNG or WebP.");
  }
  try {
    if (kind === "avatar") {
      const c = draw(bmp, bmp.width, bmp.height, { w: MEDIA_LIMITS.avatarPx, h: MEDIA_LIMITS.avatarPx, crop: true });
      return { files: [{ variant: "main", blob: await encode(c, 0.85) }], width: c.width, height: c.height, duration: null };
    }
    const big = draw(bmp, bmp.width, bmp.height, { w: MEDIA_LIMITS.photoPx, h: MEDIA_LIMITS.photoPx });
    const small = draw(bmp, bmp.width, bmp.height, { w: MEDIA_LIMITS.photoSmallPx, h: MEDIA_LIMITS.photoSmallPx });
    const [main, sm] = await Promise.all([encode(big), encode(small, 0.78)]);
    return {
      files: [
        { variant: "main", blob: main },
        { variant: "sm", blob: sm },
      ],
      width: big.width,
      height: big.height,
      duration: null,
    };
  } finally {
    bmp.close();
  }
}

/** A still frame from a video, for showing before it plays. */
async function posterFrom(video: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(video);
  try {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = url;
    await new Promise<void>((res, rej) => {
      el.onloadeddata = () => res();
      el.onerror = () => rej(new Error("no frame"));
    });
    el.currentTime = Math.min(0.5, (el.duration || 1) / 10);
    await new Promise<void>((res) => (el.onseeked = () => res()));
    const c = draw(el, el.videoWidth, el.videoHeight, { w: MEDIA_LIMITS.posterPx, h: MEDIA_LIMITS.posterPx });
    return await encode(c, 0.8);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressVideo(file: Blob & { name?: string }, onProgress?: (fraction: number) => void): Promise<Compressed> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new CompressError("That file has no video in it.");
    const duration = await input.computeDuration();
    if (duration > MEDIA_LIMITS.videoMaxSeconds) throw new CompressError(`Videos can be up to ${MEDIA_LIMITS.videoMaxSeconds / 60} minutes long.`);

    const scale = Math.min(1, MEDIA_LIMITS.videoLongEdgePx / Math.max(track.displayWidth, track.displayHeight));
    const width = even(track.displayWidth * scale);
    const height = even(track.displayHeight * scale);

    // H.264 in MP4 plays everywhere; where the browser can't encode it, VP9 in WebM
    const avc = await mb.canEncodeVideo("avc", { width, height });
    const vcodec = avc ? "avc" : (await mb.canEncodeVideo("vp9", { width, height })) ? "vp9" : null;
    if (!vcodec) throw new CompressError("This browser can't compress videos. Try Chrome, Edge or Safari.");
    const acodec = avc ? ((await mb.canEncodeAudio("aac")) ? "aac" : "opus") : "opus";

    const output = new mb.Output({ format: avc ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { width, height, fit: "contain", codec: vcodec, quality: mb.QUALITY_MEDIUM, forceTranscode: true },
      audio: { codec: acodec, quality: mb.QUALITY_MEDIUM },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new CompressError("That video's format isn't supported. Try an MP4 from your phone's camera.");
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new CompressError("Couldn't compress that video.");
    const type = avc ? "video/mp4" : "video/webm";
    const main = new Blob([buffer], { type });
    if (main.size > UPLOAD_SPECS.video.variants.main!.maxBytes) throw new CompressError("That video is still too big after compressing. Try a shorter clip.");
    const poster = await posterFrom(main);
    return { files: [{ variant: "main", blob: main }, ...(poster ? [{ variant: "poster" as const, blob: poster }] : [])], width, height, duration };
  } finally {
    input.dispose?.();
  }
}
