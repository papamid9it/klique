import "server-only";
import { randomBytes } from "node:crypto";
import { r2Config, type UploadKind } from "../env";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { IUser } from "../models/User";
import { isSiteAdmin } from "../policies/hosting";
import type { UploadSignatureDTO, UploadStatusDTO } from "@/lib/types";
import { UPLOAD_SPECS, VARIANT_SUFFIX, type UploadVariant } from "@/lib/uploads";
import { presignPut, publicUrlFor } from "./r2";

const sid = (v: unknown) => String(v);
const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/gif": "gif", "image/png": "png", "application/json": "json", "video/mp4": "mp4", "video/webm": "webm" };

export function uploadStatus(): UploadStatusDTO {
  const on = !!r2Config();
  return { avatar: on, photo: on, video: on, effect: on };
}

/**
 * Short-lived permission to put one upload (its main file plus its small copy or still frame) straight into R2.
 * The device has already resized and compressed the files; this checks their declared types and sizes against
 * the rules for that kind and signs a link for each, locked to that type and exact size.
 * Works the same for the web app, a phone app or a desktop app.
 */
export async function signUpload(viewer: IUser, kind: UploadKind, files: { variant: UploadVariant; type: string; size: number }[]): Promise<UploadSignatureDTO> {
  const cfg = r2Config();
  if (!cfg) throw new ApiError(503, `${UPLOAD_SPECS[kind].label} uploads aren't set up yet.`, { code: "uploads_not_configured" });
  if (kind === "effect" && !isSiteAdmin(viewer)) throw new ApiError(403, "Only the Klique team uploads profile effects.");
  // effect files go through the server, which checks (and minifies) them: see /api/admin/effect-files
  if (kind === "effect") throw new ApiError(422, "Upload profile effects in Admin → Profile effects.", { code: "invalid_file" });
  rateLimit(`upload:${sid(viewer._id)}`, 40, 10 * 60_000);

  const spec = UPLOAD_SPECS[kind];
  if (!files.some((f) => f.variant === "main")) throw new ApiError(422, "Nothing to upload.");
  const seen = new Set<string>();
  for (const f of files) {
    const rule = spec.variants[f.variant];
    if (!rule || seen.has(f.variant)) throw new ApiError(422, "That upload isn't allowed.", { code: "invalid_file" });
    seen.add(f.variant);
    if (!rule.types.includes(f.type)) throw new ApiError(422, "That file type isn't allowed.", { code: "invalid_file" });
    if (!Number.isInteger(f.size) || f.size <= 0 || f.size > rule.maxBytes) {
      throw new ApiError(413, `That ${spec.resource} is still over ${Math.round(rule.maxBytes / 1024 / 1024)} MB after compressing. Try a shorter or smaller one.`, { code: "too_large" });
    }
  }

  const month = new Date().toISOString().slice(0, 7);
  const base = `klique/${spec.folder}/${month}/${randomBytes(12).toString("base64url")}`;
  const items = await Promise.all(
    files.map(async (f) => {
      const key = `${base}${VARIANT_SUFFIX[f.variant]}.${EXT[f.type]}`;
      const put = await presignPut(key, f.type, f.size);
      return { variant: f.variant, uploadUrl: put.url, headers: put.headers, url: publicUrlFor(cfg, key) };
    }),
  );
  return { kind, resource: spec.resource, items };
}
