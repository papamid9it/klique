import "server-only";
import { createHash } from "node:crypto";
import { cloudinaryAccount, type UploadKind } from "../env";
import { ApiError } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import type { IUser } from "../models/User";
import type { UploadSignatureDTO, UploadStatusDTO } from "@/lib/types";
import { UPLOAD_SPECS } from "@/lib/uploads";

const sid = (v: unknown) => String(v);

export function uploadStatus(): UploadStatusDTO {
  return { avatar: !!cloudinaryAccount("avatar"), photo: !!cloudinaryAccount("photo"), video: !!cloudinaryAccount("video") };
}

/**
 * A short-lived, signed permission to upload ONE file straight to Cloudinary. The secret stays here;
 * the signature covers the folder, the allowed formats and any transformation, so a client can't change them.
 * Works the same for the web app, a phone app or a desktop app.
 */
export function signUpload(viewer: IUser, kind: UploadKind): UploadSignatureDTO {
  const account = cloudinaryAccount(kind);
  if (!account) throw new ApiError(503, `${UPLOAD_SPECS[kind].label} uploads aren't set up yet.`, { code: "uploads_not_configured" });
  rateLimit(`upload:${sid(viewer._id)}`, 40, 10 * 60_000);

  const spec = UPLOAD_SPECS[kind];
  const params: Record<string, string> = {
    allowed_formats: spec.formats.join(","),
    folder: `klique/${spec.folder}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(spec.transformation ? { transformation: spec.transformation } : {}),
  };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + account.apiSecret).digest("hex");

  return {
    kind,
    uploadUrl: `https://api.cloudinary.com/v1_1/${account.cloudName}/${spec.resource}/upload`,
    fields: { ...params, api_key: account.apiKey, signature },
    maxBytes: spec.maxBytes,
    formats: [...spec.formats],
    resource: spec.resource,
  };
}
