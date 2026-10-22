/**
 * What each kind of upload accepts. Shared by the server (signing) and every client (checking and compressing
 * before upload). Files are resized and compressed on the device, then go straight to Cloudflare R2.
 */
export type UploadKind = "avatar" | "photo" | "video";

/** The files one upload is made of: the picture or video itself, plus a small copy (photos) or a still frame (videos). */
export type UploadVariant = "main" | "sm" | "poster";

export interface UploadSpec {
  label: string;
  resource: "image" | "video";
  folder: string;
  /** what people may pick (checked before compressing) */
  formats: readonly string[];
  /** largest file someone may pick, before compression */
  maxPickBytes: number;
  /** what the device must produce, per variant: allowed types and the largest size after compression */
  variants: Partial<Record<UploadVariant, { types: readonly string[]; maxBytes: number }>>;
}

const MB = 1024 * 1024;
const STILL = ["image/webp", "image/jpeg"] as const;

export const UPLOAD_SPECS: Record<UploadKind, UploadSpec> = {
  avatar: {
    label: "Profile picture",
    resource: "image",
    folder: "avatars",
    formats: ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"],
    maxPickBytes: 25 * MB,
    variants: { main: { types: [...STILL, "image/gif"], maxBytes: 3 * MB } },
  },
  photo: {
    label: "Photo",
    resource: "image",
    folder: "photos",
    formats: ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"],
    maxPickBytes: 40 * MB,
    variants: { main: { types: [...STILL, "image/gif"], maxBytes: 8 * MB }, sm: { types: STILL, maxBytes: 1 * MB } },
  },
  video: {
    label: "Video",
    resource: "video",
    folder: "videos",
    formats: ["mp4", "mov", "webm", "m4v"],
    maxPickBytes: 500 * MB,
    variants: { main: { types: ["video/mp4", "video/webm"], maxBytes: 100 * MB }, poster: { types: STILL, maxBytes: 1 * MB } },
  },
};

/** How big things get after compression. */
export const MEDIA_LIMITS = {
  avatarPx: 1024,
  photoPx: 1920,
  photoSmallPx: 640,
  videoLongEdgePx: 1280,
  videoMaxSeconds: 5 * 60,
  posterPx: 1280,
};

/** File-name endings for the variants, so every copy of an upload sits next to the original. */
export const VARIANT_SUFFIX: Record<UploadVariant, string> = { main: "", sm: "_sm", poster: "_poster" };

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

/** null when the file is fine to pick, otherwise what to tell the person. */
export function checkFile(kind: UploadKind, file: { name: string; size: number }): string | null {
  const spec = UPLOAD_SPECS[kind];
  if (!spec.formats.includes(extOf(file.name))) return `Use ${spec.formats.slice(0, 4).join(", ").toUpperCase()}${spec.formats.length > 4 ? " or similar" : ""}.`;
  if (file.size > spec.maxPickBytes) return `That file is over ${Math.round(spec.maxPickBytes / MB)} MB.`;
  return null;
}
