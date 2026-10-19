"use client";

import { useCallback, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { checkFile } from "@/lib/uploads";
import { useUploadStatus } from "./useUploads";

export const MAX_CHAT_IMAGES = 4;

/** Pictures being attached to a chat message: choose, upload with progress, remove, clear after sending. */
export function useAttachments() {
  const enabled = !!useUploadStatus()?.photo;
  const [urls, setUrls] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  urlsRef.current = urls;

  const add = useCallback(async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []).slice(0, MAX_CHAT_IMAGES - urlsRef.current.length);
    if (!list.length) return;
    setError(null);
    for (const f of list) {
      const problem = checkFile("photo", f);
      if (problem) return setError(`${f.name}: ${problem}`);
    }
    try {
      for (const f of list) {
        setProgress(0);
        const up = await UploadService.upload("photo", f, { onProgress: setProgress });
        setUrls((u) => [...u, up.url].slice(0, MAX_CHAT_IMAGES));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }, []);

  return {
    enabled,
    urls,
    progress,
    uploading: progress !== null,
    error,
    full: urls.length >= MAX_CHAT_IMAGES,
    add,
    remove: (u: string) => setUrls((x) => x.filter((v) => v !== u)),
    clear: () => setUrls([]),
    restore: (u: string[]) => setUrls(u),
  };
}
