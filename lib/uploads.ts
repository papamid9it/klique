/** What each kind of upload accepts. Shared by the server (signing) and every client (checking before upload). */
export type UploadKind = "avatar" | "photo" | "video";

export interface UploadSpec {
  label: string;
  resource: "image" | "video";
  folder: string;
  maxBytes: number;
  formats: readonly string[];
  /** applied by Cloudinary on arrival (profile pictures are cropped square around the face) */
  transformation?: string;
}

const MB = 1024 * 1024;

export const UPLOAD_SPECS: Record<UploadKind, UploadSpec> = {
  avatar: { label: "Profile picture", resource: "image", folder: "avatars", maxBytes: 5 * MB, formats: ["jpg", "jpeg", "png", "webp", "gif"], transformation: "c_fill,g_face,w_512,h_512" },
  photo: { label: "Photo", resource: "image", folder: "photos", maxBytes: 10 * MB, formats: ["jpg", "jpeg", "png", "webp", "gif", "avif"] },
  video: { label: "Video", resource: "video", folder: "videos", maxBytes: 100 * MB, formats: ["mp4", "mov", "webm", "m4v"] },
};

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

/** null when the file is fine, otherwise what to tell the person. */
export function checkFile(kind: UploadKind, file: { name: string; size: number }): string | null {
  const spec = UPLOAD_SPECS[kind];
  if (!spec.formats.includes(extOf(file.name))) return `Use ${spec.formats.slice(0, 4).join(", ").toUpperCase()}${spec.formats.length > 4 ? " or similar" : ""}.`;
  if (file.size > spec.maxBytes) return `That file is over ${Math.round(spec.maxBytes / MB)} MB.`;
  return null;
}
