"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { useToast } from "@/components/providers/ToastProvider";
import { Segmented } from "./AdminParts";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { Button } from "@/components/ui/Button";
import { InterestChip } from "@/components/ui/Chip";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { INTERESTS, type InterestId } from "@/lib/constants";
import { CURRENCIES, formatDateLong, formatPrice, formatTime, relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { placeLabel, type Place } from "@/lib/places";
import type { DraftDTO, DraftPatch, DraftStatus, SourceDTO } from "@/lib/types";

/** ISO → the value a datetime-local input wants (the admin's own clock), and back. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/* --------------------------- paste a link --------------------------- */

function ImportBox({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: r } = await AdminService.importLink(url.trim());
      const bits = [`${r.added} new`, r.skipped && `${r.skipped} already in the inbox`, r.past && `${r.past} already over`].filter(Boolean).join(", ");
      toast(r.found ? `Found ${r.found}: ${bits}` : "No event details on that page", r.added ? "success" : "default");
      if (r.added) onImported();
      setUrl("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold">Find events at a link</h3>
      <p className="mt-1 text-sm text-ink-muted">Paste an event page or a listings page (Eventbrite, Tix, Meetup, a venue&apos;s site). Whatever we find lands below as a draft. Nothing goes live until you approve it.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TextField label="Link" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} error={error ?? undefined} required />
        </div>
        <Button type="submit" variant="primary" loading={busy} className="sm:mt-[26px]">
          <Icon name="search" size={15} /> Find events
        </Button>
      </div>
    </form>
  );
}

/* --------------------------- source pages --------------------------- */

function Sources({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => AdminService.sources(), []);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const { data: s } = await AdminService.addSource(url.trim(), name.trim());
      setData((list) => [...(list ?? []).filter((x) => x.id !== s.id), s]);
      setUrl("");
      setName("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: SourceDTO) {
    setBusy(s.id);
    try {
      await AdminService.removeSource(s.id);
      setData((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    try {
      const { data: r } = await AdminService.runSources();
      toast(`Checked ${r.sources} ${r.sources === 1 ? "page" : "pages"}: ${r.added} new ${r.added === 1 ? "draft" : "drafts"}`, "success");
      if (r.added) onImported();
      await reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">Pages checked every night</h3>
          <p className="mt-1 text-sm text-ink-muted">Listings pages the finder looks at once a night. New events show up in the inbox as drafts.</p>
        </div>
        <Button size="sm" onClick={runNow} loading={busy === "run"} disabled={!data?.length}>
          <Icon name="clock" size={14} /> Check now
        </Button>
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-12 w-full rounded-control" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-line rounded-control border border-line">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <a href={s.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-[11px] text-ink-muted hover:underline">
                    {s.url}
                  </a>
                  <p className={`text-xs ${s.lastError ? "text-danger" : "text-ink-muted"}`}>
                    {s.lastRunAt ? (s.lastError ? `Last check failed: ${s.lastError}` : `Checked ${relativeStamp(s.lastRunAt)} · ${s.lastFound} found`) : "Not checked yet"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(s)} loading={busy === s.id} aria-label={`Stop checking ${s.name}`}>
                  <Icon name="trash" size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No pages yet.</p>
        )}
      </div>
      <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <TextField label="Listings page" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <TextField label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Button type="submit" loading={busy === "add"}>
          <Icon name="plus" size={14} /> Add
        </Button>
      </form>
    </section>
  );
}

/* ------------------------------ editor ------------------------------ */

function DraftEditor({ draft, onClose, onDone }: { draft: DraftDTO; onClose: () => void; onDone: (d: DraftDTO | null) => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    title: draft.title,
    description: draft.description,
    interest: draft.interest,
    organizerName: draft.organizerName,
    venue: draft.venue,
    online: draft.online,
    place: { country: draft.country, region: draft.region, city: draft.city } as Place,
    startsAt: toLocalInput(draft.startsAt),
    endsAt: toLocalInput(draft.endsAt),
    price: String(draft.price ?? 0),
    currency: draft.currency,
    coverImage: draft.coverImage ?? "",
  }));
  const [busy, setBusy] = useState<"save" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const patch = (): DraftPatch => ({
    title: f.title,
    description: f.description,
    interest: f.interest,
    organizerName: f.organizerName,
    venue: f.venue,
    online: f.online,
    country: f.place.country,
    region: f.place.region,
    city: f.place.city,
    startsAt: fromLocalInput(f.startsAt),
    endsAt: fromLocalInput(f.endsAt),
    price: Number(f.price) || 0,
    currency: f.currency,
    coverImage: f.coverImage.trim() || null,
  });

  async function run(kind: "save" | "approve" | "reject") {
    if (kind === "approve" && !f.startsAt) return setError("Add a start time before approving.");
    if (kind === "approve" && !f.title.trim()) return setError("Add a title before approving.");
    setBusy(kind);
    setError(null);
    try {
      if (kind === "save") {
        const { data } = await AdminService.updateDraft(draft.id, patch());
        toast("Draft saved", "success");
        onDone(data);
      } else if (kind === "approve") {
        await AdminService.approveDraft(draft.id, patch());
        toast("Approved. It's live now.", "success");
        onDone(null);
      } else {
        await AdminService.rejectDraft(draft.id);
        toast("Rejected", "default");
        onDone(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Review event" description={`Found on ${draft.sourceName || new URL(draft.sourceUrl).hostname}`} size="lg">
      <div className="space-y-4">
        <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline">
          <Icon name="link" size={14} /> Open the original page
        </a>
        <TextField label="Title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
        <TextArea label="Description" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} rows={5} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Scene" value={f.interest} onChange={(e) => set("interest", e.target.value as InterestId)}>
            {INTERESTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Organiser (credited on the event)" value={f.organizerName} onChange={(e) => set("organizerName", e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Starts" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          <TextField label="Ends (optional)" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </div>
        <Switch label="Online event" checked={f.online} onChange={(v) => set("online", v)} />
        <PlaceFields value={f.place} onChange={(p) => set("place", p)} />
        <TextField label="Venue" value={f.venue} onChange={(e) => set("venue", e.target.value)} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Price (0 = free)" type="number" min={0} value={f.price} onChange={(e) => set("price", e.target.value)} />
          <SelectField label="Currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            {[...new Set([f.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
        </div>
        <TextField label="Cover image link" type="url" value={f.coverImage} onChange={(e) => set("coverImage", e.target.value)} placeholder="https://…" />
        {f.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.coverImage} alt="" className="max-h-48 w-full rounded-control border border-line object-cover" />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="danger" onClick={() => run("reject")} loading={busy === "reject"} disabled={!!busy}>
            Reject
          </Button>
          <Button onClick={() => run("save")} loading={busy === "save"} disabled={!!busy}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => run("approve")} loading={busy === "approve"} disabled={!!busy}>
            <Icon name="check" size={15} /> Approve &amp; publish
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------- inbox ------------------------------ */

function DraftRow({ d, onOpen }: { d: DraftDTO; onOpen?: () => void }) {
  const where = d.online ? "Online" : [d.venue, placeLabel({ country: d.country, region: d.region, city: d.city })].filter(Boolean).join(" · ");
  return (
    <article className="flex gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="size-20 shrink-0 overflow-hidden rounded-control border border-line bg-raised">
        {d.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverImage} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-muted">
            <Icon name="image" size={20} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <InterestChip id={d.interest} short />
          <span className="font-mono text-[11px] text-ink-muted">{d.sourceName}</span>
        </div>
        <h3 className="mt-1 truncate text-[15px] font-semibold">{d.title || "Untitled"}</h3>
        <p className="truncate text-sm text-ink-muted">
          {d.startsAt ? `${formatDateLong(d.startsAt)} · ${formatTime(d.startsAt)}` : "No date found"} · {formatPrice(d.price, d.currency)}
        </p>
        {where && <p className="truncate text-xs text-ink-muted">{where}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-2">
        {onOpen ? (
          <Button size="sm" variant="primary" onClick={onOpen}>
            Review
          </Button>
        ) : d.eventId ? (
          <Link href={`/events/${d.eventId}`} className="text-sm text-accent-text hover:underline">
            View event
          </Link>
        ) : (
          <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-ink-muted hover:underline">
            Source
          </a>
        )}
      </div>
    </article>
  );
}

function Drafts({ status, version, onChanged }: { status: DraftStatus; version: number; onChanged: () => void }) {
  const { data, loading, error, reload, setData } = useApi(() => AdminService.drafts(status), [status, version]);
  const [open, setOpen] = useState<DraftDTO | null>(null);
  if (loading) return <Skeleton className="h-28 w-full rounded-card" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) {
    return (
      <EmptyState icon="calendar" title={status === "pending" ? "Inbox is empty" : "Nothing here"} compact>
        {status === "pending" ? "Paste a link above, or add pages to check every night." : status === "approved" ? "Events you approve are listed here." : "Drafts you reject are listed here."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <DraftRow key={d.id} d={d} onOpen={status === "pending" ? () => setOpen(d) : undefined} />
      ))}
      {open && (
        <DraftEditor
          draft={open}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            setOpen(null);
            setData((list) => (next ? (list ?? []).map((x) => (x.id === next.id ? next : x)) : (list ?? []).filter((x) => x.id !== open.id)));
            if (!next) onChanged();
          }}
        />
      )}
    </div>
  );
}

export function EventInbox({ pending, onChanged }: { pending: number | null; onChanged: () => void }) {
  const [status, setStatus] = useState<DraftStatus>("pending");
  const [version, setVersion] = useState(0);
  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged();
  };
  return (
    <div className="space-y-5">
      <ImportBox onImported={refresh} />
      <section className="space-y-4">
        <Segmented
          label="Draft status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "pending", label: "Pending", count: pending },
            { id: "approved", label: "Approved" },
            { id: "rejected", label: "Rejected" },
          ]}
        />
        <Drafts status={status} version={version} onChanged={onChanged} />
      </section>
      <Sources onImported={refresh} />
    </div>
  );
}
