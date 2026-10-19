import ApiClient from "@/app/ApiCore";
import { ApiRequestError } from "@/app/ApiCore";
import { compressImage, compressVideo, CompressError, type Compressed } from "@/lib/media-compress";
import { checkFile, type UploadKind } from "@/lib/uploads";
import type { Envelope, UploadedFileDTO, UploadSignatureDTO, UploadStatusDTO } from "@/lib/types";

const api = new ApiClient();

export interface UploadOptions {
  /** 0 → 1 across compressing and uploading */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** The file shape this service needs. A web `File`, or `{ uri, name, size, type }` wrapped for React Native / Electron. */
export type UploadableFile = Blob & { name: string };

function put(url: string, headers: Record<string, string>, blob: Blob, onBytes: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onerror = () => reject(new ApiRequestError(0, "Couldn't reach the upload service. Check your connection.", "network"));
    xhr.onabort = () => reject(new ApiRequestError(0, "Upload cancelled.", "aborted"));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiRequestError(xhr.status, "The upload failed. Please try again.", "upload_failed")));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}

/**
 * Pictures and videos. The device resizes and compresses the file first, the server signs one link per file,
 * and the files go straight to Cloudflare R2. The returned URL is what gets saved on a profile, topic,
 * community or message. Same flow on web and desktop (Electron); a phone app does its own compression.
 */
export const UploadService = {
  /** which kinds this server can take right now (an unconfigured kind falls back to pasting a link) */
  status: () => api.get<Envelope<UploadStatusDTO>>("/api/uploads/status"),
  sign: (kind: UploadKind, files: { variant: "main" | "sm" | "poster"; type: string; size: number }[]) => api.post<Envelope<UploadSignatureDTO>>("/api/uploads/sign", { kind, files }),

  async upload(kind: UploadKind, file: UploadableFile, opts: UploadOptions = {}): Promise<UploadedFileDTO> {
    const problem = checkFile(kind, file);
    if (problem) throw new ApiRequestError(400, problem, "invalid_file");

    // 1. shrink on the device (videos take a while, so they get most of the progress bar)
    const share = kind === "video" ? 0.7 : 0.15;
    let done: Compressed;
    try {
      opts.onProgress?.(0.02);
      done = kind === "video" ? await compressVideo(file, (p) => opts.onProgress?.(p * share)) : await compressImage(kind, file);
    } catch (e) {
      if (e instanceof CompressError) throw new ApiRequestError(400, e.message, "invalid_file");
      throw new ApiRequestError(400, kind === "video" ? "Couldn't compress that video. Try a different file." : "Couldn't process that picture. Try a different file.", "invalid_file");
    }
    if (opts.signal?.aborted) throw new ApiRequestError(0, "Upload cancelled.", "aborted");
    opts.onProgress?.(share);

    // 2. one signed link per file, locked to its type and size
    const sig = (await UploadService.sign(kind, done.files.map((f) => ({ variant: f.variant, type: f.blob.type, size: f.blob.size })))).data;

    // 3. upload them all, with one progress bar across the bytes
    const total = done.files.reduce((n, f) => n + f.blob.size, 0);
    const sent = new Map<string, number>();
    const report = () => opts.onProgress?.(share + (1 - share) * ([...sent.values()].reduce((a, b) => a + b, 0) / total));
    await Promise.all(
      done.files.map((f) => {
        const item = sig.items.find((i) => i.variant === f.variant)!;
        return put(item.uploadUrl, item.headers, f.blob, (n) => (sent.set(f.variant, n), report()), opts.signal);
      }),
    );
    opts.onProgress?.(1);

    const url = (v: "main" | "sm" | "poster") => sig.items.find((i) => i.variant === v)?.url ?? null;
    return { url: url("main")!, width: done.width, height: done.height, duration: done.duration, poster: url("poster") };
  },
};
