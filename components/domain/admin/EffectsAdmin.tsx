"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { EffectService, type EffectInput } from "@/app/services/EffectService";
import { Badge, Panel } from "@/components/domain/admin/AdminParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Switch, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi, mutateApi } from "@/lib/hooks/useApi";
import { useUploadStatus } from "@/lib/hooks/useUploads";
import type { ProfileEffectDTO } from "@/lib/types";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Pick the Lottie and upload it through the server, which checks it (and minifies JSON); shows what's there now and
 * the size before and after. Without uploads set up, paste a link instead.
 */
function FileInput({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const status = useUploadStatus();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [sizes, setSizes] = useState<{ before: number; after: number } | null>(null);
  const canUpload = !!status?.effect;

  async function pick(file: File) {
    setBusy(true);
    try {
      const res = (await EffectService.uploadFile(file)).data;
      setSizes({ before: res.before, after: res.after });
      onChange(res.url);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      {canUpload ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".lottie,.json,application/json,application/zip" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          <Button size="sm" onClick={() => input.current?.click()} loading={busy}>
            <Icon name="image" size={14} /> {value ? "Replace" : "Upload"}
          </Button>
          {value && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-muted">{value.split("/").pop()}</span>}
        </div>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://…/effect.lottie" className="h-10 w-full rounded-control border border-line bg-canvas px-3 font-mono text-sm" aria-label={label} />
      )}
      {sizes && (
        <p className="font-mono text-[11.5px] text-ink-muted">
          {sizes.after < sizes.before ? `${kb(sizes.before)} → ${kb(sizes.after)} after minifying` : `${kb(sizes.after)}, stored as it is`}
        </p>
      )}
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

/** Add or change one effect, with a live preview on a sample card. */
function EffectForm({ initial, onSaved, onCancel }: { initial?: ProfileEffectDTO; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [fileUrl, setFileUrl] = useState(initial?.fileUrl ?? "");
  const [posterFrame, setPosterFrame] = useState(initial?.posterFrame ?? 0.5);
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && fileUrl;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const input: EffectInput = { name: name.trim(), fileUrl, posterFrame, price: price.trim() === "" ? null : Math.max(0, Math.round(Number(price) || 0)), active };
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

  const sample: ProfileEffectDTO | null = fileUrl ? { id: "preview", name, kind: "lottie", fileUrl, posterFrame, active: true, price: 0 } : null;
  return (
    <form onSubmit={save} className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Dragon flight" required />
        <FileInput
          label="Animation"
          hint="A Lottie (.lottie or .json) with a transparent background, up to 8 MB. .lottie files are much smaller. It covers the whole card and loops."
          value={fileUrl}
          onChange={setFileUrl}
        />
        {fileUrl && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium">Paused frame</span>
            <input type="range" min={0} max={1} step={0.01} value={posterFrame} onChange={(e) => setPosterFrame(Number(e.target.value))} className="w-full accent-[var(--accent-text)]" />
            <span className="block text-xs text-ink-muted">Where it waits on picker tiles, and for people with animations off or data saver on ({Math.round(posterFrame * 100)}% of the way through).</span>
          </label>
        )}
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
          {sample ? <ProfileEffect spec={sample} /> : <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-ink-muted">Add the animation to see it here.</p>}
        </div>
        {sample && (
          <>
            <p className="eyebrow mt-4 mb-2">Paused frame</p>
            <div className="relative aspect-[3/4] w-1/2 overflow-hidden rounded-card border border-line bg-raised">
              <div className="absolute top-6 left-3 size-10 rounded-full border-2 border-surface bg-surface" />
              <ProfileEffect spec={sample} paused />
            </div>
          </>
        )}
      </div>
    </form>
  );
}

/** One effect in the list: held on its paused frame over a sample picture (it plays while you point at it), then its name, price and actions. */
function EffectCard({ e, onEdit, onRemove }: { e: ProfileEffectDTO; onEdit: () => void; onRemove: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative mx-auto my-2.5 flex size-40 items-center justify-center overflow-hidden rounded-control bg-raised">
        <span className="size-16 rounded-full border-2 border-surface bg-surface" />
        <ProfileEffect spec={e} paused={!hover} />
        {!e.active && (
          <span className="absolute top-1.5 left-1.5 z-20">
            <Badge tone="neutral">Hidden</Badge>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{e.name}</span>
          <span className="block font-mono text-[11px] text-ink-muted">{e.price} Hype</span>
        </span>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={onRemove}>
          <Icon name="trash" size={14} />
        </Button>
      </div>
    </li>
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
          Upload a Lottie animation (.lottie or .json). People see &ldquo;Profile effects are coming&rdquo; until you add one.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {data.map((e) =>
            editing !== "new" && editing?.id === e.id ? (
              <li key={e.id} className="col-span-full">
                <Panel title={`Edit ${e.name}`}>
                  <EffectForm initial={e} onSaved={done} onCancel={() => setEditing(null)} />
                </Panel>
              </li>
            ) : (
              <EffectCard key={e.id} e={e} onEdit={() => setEditing(e)} onRemove={() => void remove(e)} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
