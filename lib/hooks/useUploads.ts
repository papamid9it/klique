"use client";

import { useEffect, useState } from "react";
import { UploadService } from "@/app/services/UploadService";
import type { UploadStatusDTO } from "@/lib/types";

let cached: UploadStatusDTO | null = null;

/** Which upload kinds are switched on. `null` while loading; callers treat that as "not yet". */
export function useUploadStatus(): UploadStatusDTO | null {
  const [s, setS] = useState<UploadStatusDTO | null>(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    UploadService.status().then(
      (r) => {
        cached = r.data;
        if (live) setS(r.data);
      },
      () => live && setS({ avatar: false, photo: false, video: false, effect: false }),
    );
    return () => {
      live = false;
    };
  }, []);
  return s;
}
