"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EffectService, type EffectInput } from "@/app/services/EffectService";
import { UploadService } from "@/app/services/UploadService";
import { Badge, Panel } from "@/components/domain/admin/AdminParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi, mutateApi } from "@/lib/hooks/useApi";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import type { ProfileEffectDTO } from "@/lib/types";

/** Pick a file and upload it (or, without uploads set up, paste a link). Shows what's there now. */
function FileInput({ label, hint, accept, kind, value, onChange }: { label: string; hint: string; accept: string; kind: "effect" | "photo"; value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const status = useUploadStatus();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const canUpload = !!status?.[kind];

  async function pick(file: File) {
    setBusy(0);
    try {
      const res = await UploadService.upload(kind, file, { onProgress: (f) => setBusy(f) });
      onChange(res.url);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      {canUpload ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          <Button size="sm" onClick={() => input.current?.click()} loading={busy !== null}>
            <Icon name="image" size={14} /> {value ? "Replace" : "Upload"}
          </Button>
          {busy !== null && <span className="font-mono text-xs text-ink-muted">{Math.round(busy * 100)}%</span>}
          {value && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-muted">{value.split("/").pop()}</span>}
        </div>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://…" className="h-10 w-full rounded-control border border-line bg-canvas px-3 font-mono text-sm" aria-label={label} />
      )}
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

const kindOf = (url: string): EffectInput["kind"] => (/\.json($|\?)/i.test(url) ? "lottie" : "image");

/** Add or change one effect, with a live preview on a sample card. */
function EffectForm({ initial, onSaved, onCancel }: { initial?: ProfileEffectDTO; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [fileUrl, setFileUrl] = useState(initial?.fileUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState(initial?.previewUrl ?? "");
  const [kind, setKind] = useState<EffectInput["kind"]>(initial?.kind ?? "image");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && fileUrl && previewUrl;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const input: EffectInput = { name: name.trim(), kind, fileUrl, previewUrl, price: price.trim() === "" ? null : Math.max(0, Math.round(Number(price) || 0)), active };
      if (initial) await EffectService.edit(initial.id, input);
      else await EffectService.add(input);
      toast("Saved", "success");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const sample: ProfileEffectDTO | null = fileUrl && previewUrl ? { id: "preview", name, kind, fileUrl, previewUrl, active: true, price: 0 } : null;
  return (
    <form onSubmit={save} className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Dragon flight" required />
        <FileInput
          label="Animation"
          hint="An animated WebP or APNG with a transparent background, or a Lottie JSON. Up to 8 MB. It covers the whole card and loops."
          accept=".webp,.png,.apng,.json,image/webp,image/png,application/json"
          kind="effect"
          value={fileUrl}
          onChange={(u) => {
            setFileUrl(u);
            setKind(kindOf(u));
          }}
        />
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value as EffectInput["kind"])}>
          <option value="image">Animated picture (WebP / APNG)</option>
          <option value="lottie">Lottie JSON</option>
        </SelectField>
        <FileInput label="Still picture" hint="Shown on its tile, and to people who turn motion down or use data saver." accept="image/*" kind="photo" value={previewUrl} onChange={setPreviewUrl} />
        <TextField label="Price (Hype)" type="number" min={0} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} hint="Leave empty for the default profile effect price. 0 makes it free." />
        {initial && <Switch checked={active} onChange={setActive} label="Showing" hint="Hidden effects can't be picked. People wearing one keep it until their unlock ends." />}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            {initial ? "Save" : "Add effect"}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Preview</p>
        <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-line bg-raised">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-accent/40 to-accent2/40" />
          <div className="absolute top-10 left-4 size-16 rounded-full border-4 border-surface bg-raised" />
          {sample ? <ProfileEffect spec={sample} /> : <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-ink-muted">Add the animation and still picture to see it here.</p>}
        </div>
      </div>
    </form>
  );
}

/** Admin → Profile effects: the animations people can unlock with Hype to play over their profile card. */
export function EffectsAdmin() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => EffectService.adminList(), [], { key: "admin-effects" });
  const [editing, setEditing] = useState<ProfileEffectDTO | "new" | null>(null);
  const done = () => {
    setEditing(null);
    void reload();
    // the catalogue people pick from, fresh
    void EffectService.list().then((r) => mutateApi<ProfileEffectDTO[]>("profile-effects", () => r.data)).catch(() => {});
  };

  async function remove(e: ProfileEffectDTO) {
    try {
      await EffectService.remove(e.id);
      toast("Removed", "success");
      done();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <Panel title="New profile effect">
          <EffectForm onSaved={done} onCancel={() => setEditing(null)} />
        </Panel>
      ) : (
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Icon name="plus" size={15} /> Add a profile effect
        </Button>
      )}
      {data.length === 0 && editing !== "new" ? (
        <EmptyState icon="asterisk" title="No profile effects yet">
          Upload an animation (animated WebP or APNG with a transparent background, or a Lottie JSON) and a still picture. People see &ldquo;Profile effects are coming&rdquo; until you add one.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((e) =>
            editing !== "new" && editing?.id === e.id ? (
              <li key={e.id} className="sm:col-span-2 xl:col-span-3">
                <Panel title={`Edit ${e.name}`}>
                  <EffectForm initial={e} onSaved={done} onCancel={() => setEditing(null)} />
                </Panel>
              </li>
            ) : (
              <li key={e.id} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="relative aspect-[4/3] bg-raised">
                  <ProfileEffect spec={e} />
                </div>
                <div className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.name}</span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {e.kind === "lottie" ? "Lottie" : "Animated picture"} · {e.price} Hype
                    </span>
                  </span>
                  {!e.active && <Badge tone="neutral">Hidden</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={() => void remove(e)}>
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
