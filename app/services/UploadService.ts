import ApiClient from "@/app/ApiCore";
import { ApiRequestError } from "@/app/ApiCore";
import { checkFile, type UploadKind } from "@/lib/uploads";
import { videoPoster } from "@/lib/cdn";
import type { Envelope, UploadedFileDTO, UploadSignatureDTO, UploadStatusDTO } from "@/lib/types";

const api = new ApiClient();

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** The file shape this service needs. A web `File`, or `{ uri, name, size, type }` wrapped for React Native / Electron. */
export type UploadableFile = Blob & { name: string };

/**
 * Pictures and videos. The server signs, the app uploads straight to Cloudinary (the right account for each kind),
 * and the returned URL is what gets saved on a profile, topic, community or message.
 * Same flow on web, mobile and desktop.
 */
export const UploadService = {
  /** which kinds this server can take right now (an unconfigured kind falls back to pasting a link) */
  status: () => api.get<Envelope<UploadStatusDTO>>("/api/uploads/status"),
  sign: (kind: UploadKind) => api.post<Envelope<UploadSignatureDTO>>("/api/uploads/sign", { kind }),

  async upload(kind: UploadKind, file: UploadableFile, opts: UploadOptions = {}): Promise<UploadedFileDTO> {
    const problem = checkFile(kind, file);
    if (problem) throw new ApiRequestError(400, problem, "invalid_file");
    const sig = (await UploadService.sign(kind)).data;

    const form = new FormData();
    for (const [k, v] of Object.entries(sig.fields)) form.append(k, v);
    form.append("file", file, file.name);

    const res = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", sig.uploadUrl);
      xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
      xhr.onerror = () => reject(new ApiRequestError(0, "Couldn't reach the upload service. Check your connection.", "network"));
      xhr.onabort = () => reject(new ApiRequestError(0, "Upload cancelled.", "aborted"));
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* handled below */
        }
        if (xhr.status >= 200 && xhr.status < 300 && typeof body.secure_url === "string") resolve(body);
        else reject(new ApiRequestError(xhr.status, (body.error as { message?: string } | undefined)?.message ?? "The upload failed. Please try again.", "upload_failed"));
      };
      opts.signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(form);
    });

    const url = String(res.secure_url);
    return {
      url,
      publicId: String(res.public_id ?? ""),
      width: typeof res.width === "number" ? res.width : null,
      height: typeof res.height === "number" ? res.height : null,
      duration: typeof res.duration === "number" ? res.duration : null,
      poster: sig.resource === "video" ? videoPoster(url) : null,
    };
  },
};
