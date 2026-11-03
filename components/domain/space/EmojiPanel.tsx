"use client";

import { useRef, useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { UploadService } from "@/app/services/UploadService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cdn } from "@/lib/cdn";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, type PlanId } from "@/lib/plans";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();
type E = { id: string; name: string; url: string; animated: boolean };
type List = { items: E[]; cap: number; plan: PlanId; canManage: boolean };

const nameFrom = (file: string) => file.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "emoji";

/**
 * Community settings → Emoji (owner, or "Manage emoji"): upload PNG, WebP or GIF (animated GIFs stay animated, at
 * most 256 KB), give each a :name:, delete. How many depends on the owner's plan.
 */
export function EmojiPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<List>>(`/api/communities/${slug}/emoji`), [slug], { key: `emoji:${slug}` });
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ url: string; name: string } | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const up = await UploadService.upload("emoji", f);
      setPending({ url: up.url, name: nameFrom(f.name) });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  async function add() {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post(`/api/communities/${slug}/emoji`, pending);
      toast(`:${pending.name}: added`, "success");
      setPending(null);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: E) {
    try {
      await api.delete(`/api/communities/${slug}/emoji/${e.id}`);
      toast(`:${e.name}: deleted`, "success");
      await reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const full = data.items.length >= data.cap;
  return (
    <>
      <SettingsBlock title="Custom emoji" intro="Members type :name: (or pick it from the smiley button) to use them here. Pro members can use them anywhere.">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={file} type="file" accept="image/png,image/gif,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="primary" size="sm" onClick={() => file.current?.click()} loading={busy && !pending} disabled={full || !!pending}>
            <Icon name="plus" size={14} /> Upload emoji
          </Button>
          <span className="text-xs text-ink-muted">
            {data.items.length} of {data.cap} used · owner&apos;s {PLAN_NAMES[data.plan]} plan
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-muted">PNG, WebP or GIF (animated is fine), up to 256 KB. Square pictures look best.</p>
        {full && data.plan !== "pro" && (
          <p className="mt-2 text-sm text-ink-muted">
            That&apos;s all {PLAN_NAMES[data.plan]} allows. <a href="/pricing" className="font-medium text-accent-text underline">See plans</a>
          </p>
        )}
        {pending && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-line bg-raised p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.url} alt="" className="size-10 object-contain" />
            <label className="flex items-center gap-1 text-sm">
              :
              <input value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} aria-label="Emoji name" className="h-9 w-40 rounded-control border border-line bg-surface px-2 font-mono text-sm" />:
            </label>
            <Button size="sm" variant="primary" loading={busy} disabled={pending.name.length < 2} onClick={() => void add()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        )}
      </SettingsBlock>
      <SettingsBlock>
        {data.items.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-control border border-line bg-surface p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.animated ? e.url : cdn(e.url, { w: 64 })} alt="" className="size-8 shrink-0 object-contain" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">:{e.name}:</span>
                <button type="button" onClick={() => void remove(e)} aria-label={`Delete :${e.name}:`} className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-danger">
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No emoji yet.</p>
        )}
      </SettingsBlock>
    </>
  );
}
