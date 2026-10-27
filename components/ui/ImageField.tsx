"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import { checkFile, type UploadKind, UPLOAD_SPECS } from "@/lib/uploads";
import { cdn } from "@/lib/cdn";
import { focalStyle, splitFocal } from "@/lib/focal";
import { ImagePositioner } from "./ImagePositioner";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { cx } from "./cx";

/**
 * Upload a picture (profile photo, cover…) with a preview and a progress bar.
 * When this kind of upload isn't set up on the server, it falls back to a plain link field.
 */
export function ImageField({
  kind,
  label,
  value,
  onChange,
  shape = "wide",
  hint,
  error,
  fallback,
  reposition,
  required,
}: {
  kind: Extract<UploadKind, "avatar" | "photo">;
  label: string;
  value: string;
  onChange: (url: string) => void;
  shape?: "round" | "wide";
  hint?: string;
  error?: string;
  /** shown in the preview box when there is no picture (an avatar with initials, an art cover…) */
  fallback?: React.ReactNode;
  /** let people choose what part shows (drag and zoom) in a frame of this shape, after uploading and any time later */
  reposition?: { aspect: number; round?: boolean };
  /** a picture must stay: it can be replaced but not removed */
  required?: boolean;
}) {
  const status = useUploadStatus();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState(false);
  const [positioning, setPositioning] = useState<string | null>(null);
  const enabled = !!status?.[kind];
  const spec = UPLOAD_SPECS[kind];

  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = checkFile(kind, file);
    if (problem) return setErr(problem);
    setErr(null);
    setProgress(0);
    try {
      const up = await UploadService.upload(kind, file, { onProgress: setProgress });
      onChange(up.url);
      if (reposition) setPositioning(up.url); // straight on to choosing what shows
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  const busy = progress !== null;
  const shown = err ?? error;
  const id = `if-${kind}-${label.replace(/\W/g, "")}`;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium" id={id}>
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className={cx("relative flex shrink-0 items-center justify-center overflow-hidden border border-line bg-raised", shape === "round" ? "size-20 rounded-full" : "h-24 w-40 rounded-control")}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shape === "round" ? cdn(value, { w: 160, h: 160, fit: "face" }) : cdn(value, { w: 400 })} alt="" style={focalStyle(splitFocal(value).focal)} className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          ) : (
            (fallback ?? <Icon name="image" size={22} className="text-ink-muted" />)
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-mono text-xs font-semibold text-white" role="status">
              {Math.round((progress ?? 0) * 100)}%
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-44 space-y-2">
          <input ref={input} type="file" hidden accept={spec.formats.map((f) => `.${f}`).join(",")} onChange={(e) => void pick(e.target.files?.[0])} aria-labelledby={id} />
          <div className="flex flex-wrap gap-2">
            {enabled && (
              <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={busy}>
                <Icon name="image" size={15} /> {value ? "Change" : "Upload"}
              </Button>
            )}
            {value && reposition && (
              <Button size="sm" variant="ghost" onClick={() => setPositioning(value)} disabled={busy}>
                <Icon name="move" size={15} /> Reposition
              </Button>
            )}
            {value && !required && (
              <Button size="sm" variant="ghost" onClick={() => onChange("")} disabled={busy}>
                Remove
              </Button>
            )}
            {enabled && !link && (
              <button type="button" onClick={() => setLink(true)} className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                Use a link
              </button>
            )}
          </div>
          {(!enabled || link) && status && (
            <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" aria-label={`${label} link`} className="h-9 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-sm placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
          )}
          {shown ? (
            <p role="alert" className="text-sm text-danger">
              {shown}
            </p>
          ) : (
            <p className="text-xs text-ink-muted">{hint ?? (enabled ? `JPG, PNG, WebP or HEIC, up to ${Math.round(spec.maxPickBytes / 1048576)} MB. We resize it for you.` : "Uploads aren't set up yet, so paste a link instead.")}</p>
          )}
        </div>
      </div>
      {reposition && positioning && (
        <ImagePositioner
          open
          url={positioning}
          aspect={reposition.aspect}
          round={reposition.round}
          title={`Position your ${label.toLowerCase().replace(/ \(optional\)$/, "")}`}
          onClose={() => setPositioning(null)}
          onSave={(u) => {
            onChange(u);
            setPositioning(null);
          }}
        />
      )}
    </div>
  );
}
