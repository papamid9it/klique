"use client";

import { useCategories } from "@/lib/hooks/useCategories";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { CommunityService } from "@/app/services/CommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Segmented } from "./AdminParts";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { Button } from "@/components/ui/Button";
import { InterestChip } from "@/components/ui/Chip";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { type InterestId } from "@/lib/constants";
import { CURRENCIES, formatDateLong, formatPrice, formatTime, relativeStamp } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { placeLabel, type Place } from "@/lib/places";
import type { DraftDTO, DraftPatch, DraftStatus, FinderRunDTO, SourceDTO } from "@/lib/types";

/** ISO → the value a datetime-local input wants (the admin's own clock), and back. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const dateInput = (d: Date) => d.toISOString().slice(0, 10);
const providerLabel: Record<DraftDTO["provider"], string> = { page: "Web page", ical: "Calendar", rss: "Feed", ticketmaster: "Ticketmaster", eventbrite: "Eventbrite", link: "Link" };

/* --------------------------- running a search --------------------------- */

/**
 * Drives a finder job: asks the server for one step at a time (each does ~12s of work, a source at a time)
 * until it's done. Closing the page just stops asking; the nightly cron finishes the job.
 */
function useRunner(onFinished: () => void) {
  const [run, setRun] = useState<FinderRunDTO | null>(null);
  const alive = useRef(true);
  const toast = useToast();
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const drive = useCallback(
    async (first: FinderRunDTO) => {
      setRun(first);
      let cur = first;
      let fails = 0;
      while (alive.current && cur.status === "running") {
        try {
          cur = (await AdminService.stepSearch(cur.id)).data;
          fails = 0;
          if (alive.current) setRun(cur);
          if (cur.added) finished.current();
        } catch (e) {
          if (++fails >= 3) {
            toast(`The search paused: ${errorMessage(e)}. It will finish tonight.`, "error");
            return;
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (alive.current && cur.status === "done") {
        toast(cur.added ? `Found ${cur.added} new ${cur.added === 1 ? "event" : "events"} for review` : "No new events this time", cur.added ? "success" : "default");
        finished.current();
      }
    },
    [toast],
  );

  // pick up a search still running from earlier (a refresh, or another tab)
  useEffect(() => {
    let live = true;
    AdminService.recentRuns().then(
      (r) => {
        const open = r.data.find((x) => x.status === "running" && x.trigger !== "nightly");
        if (live && open) void drive(open);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [drive]);

  return { run, start: (r: FinderRunDTO) => void drive(r), clear: () => setRun(null) };
}

function RunProgress({ run, onClose }: { run: FinderRunDTO; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const total = run.tasks.length;
  const pct = total ? Math.round((run.done / total) * 100) : 100;
  const where = [run.query.city, run.query.region, run.query.country].filter(Boolean)[0];
  return (
    <section className="rounded-card border border-accent-text/50 bg-surface p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {run.status === "running" ? "Searching…" : "Search finished"} {where ? <span className="font-normal text-ink-muted">· {where}</span> : null}
          </p>
          <p className="text-sm text-ink-muted">
            {run.done} of {total} {total === 1 ? "source" : "sources"} done · <b className="text-ink">{run.added} new</b> · {run.duplicates} already known · {run.filtered} outside your filters
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "Details"}
          </Button>
          {run.status !== "running" && (
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      {open && (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[13px]">
          {run.tasks.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={cx("mt-0.5 shrink-0", t.status === "failed" ? "text-danger" : t.status === "done" ? "text-accent-text" : "text-ink-muted")}>
                <Icon name={t.status === "failed" ? "x" : t.status === "done" ? "check" : "clock"} size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t.label || t.kind}</span>
                {t.status === "done" && <span className="text-ink-muted"> · {t.found} found, {t.added} new</span>}
                {t.note && <span className={cx("block text-xs", t.status === "failed" ? "text-danger" : "text-ink-muted")}>{t.note}</span>}
              </span>
            </li>
          ))}
          {!run.tasks.length && <li className="text-ink-muted">Nothing to search: add an API key, a saved page or a link.</li>}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ the search ------------------------------ */

function FinderSearch({ busy, onRun, onSaved }: { busy: boolean; onRun: (r: FinderRunDTO) => void; onSaved: () => void }) {
  const toast = useToast();
  const categories = useCategories();
  const [place, setPlace] = useState<Place>({ country: "NG", region: "lagos", city: "lagos" });
  const [interests, setInterests] = useState<string[]>([]);
  const [from, setFrom] = useState(() => dateInput(new Date()));
  const [to, setTo] = useState(() => dateInput(new Date(Date.now() + 30 * 86_400_000)));
  const [includeSources, setIncludeSources] = useState(true);
  const [links, setLinks] = useState("");
  const [sending, setSending] = useState<"find" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setSending("find");
    setError(null);
    try {
      const urls = links.split(/\s+/).map((l) => l.trim()).filter(Boolean);
      const { data } = await AdminService.startSearch({ ...place, interests, from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString(), includeSources, urls });
      onRun(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  async function save() {
    setSending("save");
    try {
      const days = Math.max(1, Math.min(180, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) || 30));
      await AdminService.saveSearch({ name: [place.city || place.region || place.country, interests.length ? interests.join(", ") : "all"].join(" · "), country: place.country, region: place.region, city: place.city, interests, days, includeSources });
      toast("Saved. It runs every night and adds new finds to the queue.", "success");
      onSaved();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(null);
    }
  }

  return (
    <form onSubmit={find} className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div>
        <h3 className="text-[15px] font-semibold">Find events</h3>
        <p className="mt-1 text-sm text-ink-muted">Searches official event APIs, the pages saved below, and any links you add, then puts what matches into the review queue. Nothing goes live until you post it.</p>
      </div>
      <PlaceFields value={place} onChange={setPlace} />
      <p className="-mt-2 text-xs text-ink-muted">Leave the city empty to search the whole {place.region ? "state" : "country"}.</p>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Categories {interests.length ? `· ${interests.length}` : "· all"}</legend>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = interests.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)} className={cx("rounded-full border px-3 py-1.5 text-[13px] font-medium transition", on ? "border-accent-text bg-accent/15 text-ink" : "border-line text-ink-muted hover:text-ink")}>
                <span aria-hidden="true">{c.glyph}</span> {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        <TextField label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
      </div>
      <Switch label="Also check the saved pages" hint="The calendars, feeds and listing pages in “Pages checked every night” below." checked={includeSources} onChange={setIncludeSources} />
      <TextArea label="Extra links for this search (optional)" value={links} onChange={(e) => setLinks(e.target.value)} rows={2} placeholder={"One per line: an organiser's events page, a venue's listings, a ticket page, an .ics calendar…"} hint="Instagram and Facebook can't be read (their terms don't allow it): use the organiser's own site or ticket page." />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => void save()} loading={sending === "save"} disabled={!!sending}>
          <Icon name="bookmark" size={15} /> Save as nightly search
        </Button>
        <Button type="submit" variant="primary" loading={sending === "find"} disabled={!!sending || busy}>
          <Icon name="search" size={15} /> {busy ? "Searching…" : "Find events"}
        </Button>
      </div>
    </form>
  );
}

/* --------------------------- saved searches --------------------------- */

function SavedSearches({ version, busy, onRun }: { version: number; busy: boolean; onRun: (r: FinderRunDTO) => void }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => AdminService.savedSearches(), [version]);
  const [working, setWorking] = useState<string | null>(null);
  async function act(id: string, fn: () => Promise<void>) {
    setWorking(id);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setWorking(null);
    }
  }
  if (loading) return <Skeleton className="h-16 w-full rounded-card" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold">Saved searches</h3>
      <p className="mt-1 text-sm text-ink-muted">Run every night at 4am (UTC), one after another. New finds only go to the review queue.</p>
      <ul className="mt-3 divide-y divide-line rounded-control border border-line">
        {data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name || placeLabel(s)}</p>
              <p className="text-xs text-ink-muted">
                {placeLabel({ country: s.country, region: s.region, city: s.city })} · next {s.days} days · {s.interests.length ? `${s.interests.length} categories` : "all categories"} · {s.lastRunAt ? `last ran ${relativeStamp(s.lastRunAt)}, ${s.lastAdded} new` : "not run yet"}
              </p>
            </div>
            <Switch
              label="Nightly"
              checked={s.daily}
              onChange={(daily) =>
                void act(s.id, async () => {
                  const { data: next } = await AdminService.updateSearch(s.id, { daily });
                  setData((l) => (l ?? []).map((x) => (x.id === next.id ? next : x)));
                })
              }
            />
            <Button size="sm" onClick={() => void act(s.id, async () => onRun((await AdminService.runSearch(s.id)).data))} loading={working === s.id} disabled={busy}>
              Run now
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => void act(s.id, async () => (await AdminService.removeSearch(s.id), setData((l) => (l ?? []).filter((x) => x.id !== s.id))))}>
              <Icon name="trash" size={14} />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- source pages --------------------------- */

function Sources({ busy, onRun }: { busy: boolean; onRun: (r: FinderRunDTO) => void }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => AdminService.sources(), []);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setWorking("add");
    try {
      const { data: s } = await AdminService.addSource(url.trim(), name.trim());
      setData((list) => [...(list ?? []).filter((x) => x.id !== s.id), s]);
      setUrl("");
      setName("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setWorking(null);
    }
  }

  async function remove(s: SourceDTO) {
    setWorking(s.id);
    try {
      await AdminService.removeSource(s.id);
      setData((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setWorking(null);
    }
  }

  async function runNow() {
    setWorking("run");
    try {
      onRun((await AdminService.runSources()).data);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">Pages checked every night</h3>
          <p className="mt-1 text-sm text-ink-muted">Organisers&apos; and venues&apos; listing pages, .ics calendars, RSS feeds, and Eventbrite organiser pages (needs EVENTBRITE_TOKEN). Read politely: we follow robots.txt and wait between requests.</p>
        </div>
        <Button size="sm" onClick={runNow} loading={working === "run"} disabled={!data?.length || busy}>
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
                  <p className={`text-xs ${s.lastError ? "text-danger" : "text-ink-muted"}`}>{s.lastRunAt ? (s.lastError ? `Last check failed: ${s.lastError}` : `Checked ${relativeStamp(s.lastRunAt)} · ${s.lastFound} found`) : "Not checked yet"}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(s)} loading={working === s.id} aria-label={`Stop checking ${s.name}`}>
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
        <TextField label="Page, calendar or feed" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <TextField label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Button type="submit" loading={working === "add"}>
          <Icon name="plus" size={14} /> Add
        </Button>
      </form>
    </section>
  );
}

/* ------------------------------ editor ------------------------------ */

function DraftEditor({ draft, target, onClose, onDone }: { draft: DraftDTO; target: string; onClose: () => void; onDone: (d: DraftDTO | null) => void }) {
  const categories = useCategories();
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
    if (kind === "approve" && !f.startsAt) return setError("Add a start time before posting.");
    if (kind === "approve" && !f.title.trim()) return setError("Add a title before posting.");
    setBusy(kind);
    setError(null);
    try {
      if (kind === "save") {
        const { data } = await AdminService.updateDraft(draft.id, patch());
        toast("Draft saved", "success");
        onDone(data);
      } else if (kind === "approve") {
        await AdminService.approveDraft(draft.id, patch(), target ? { communitySlug: target } : {});
        toast("Posted. It's live now.", "success");
        onDone(null);
      } else {
        await AdminService.rejectDraft(draft.id);
        toast("Rejected. It won't come back.", "default");
        onDone(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Review event" description={`Found via ${providerLabel[draft.provider] ?? "the web"} · ${draft.sourceName || new URL(draft.sourceUrl).hostname}`} size="lg">
      <div className="space-y-4">
        <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline">
          <Icon name="link" size={14} /> Open the original page (kept on the event as “More info / tickets”)
        </a>
        <TextField label="Title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
        <TextArea label="Description" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} rows={5} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={f.interest} onChange={(e) => set("interest", e.target.value as InterestId)}>
            {categories.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
          <TextField label="Organiser (credited on the event)" value={f.organizerName} onChange={(e) => set("organizerName", e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Starts (your time)" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} hint={draft.timezone ? `The source gave its times in ${draft.timezone}` : undefined} />
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
        <ImageField kind="photo" label="Cover picture" value={f.coverImage} onChange={(v) => set("coverImage", v)} hint={draft.imageReusable ? "From the official API (allowed to reuse). Replace it if you like." : "Upload one, or leave it empty for a generated cover. The source's own picture isn't reused without permission."} />
        {!draft.imageReusable && draft.sourceImage && (
          <p className="text-xs text-ink-muted">
            The source shows{" "}
            <a href={draft.sourceImage} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
              this picture
            </a>
            . Use it only if the organiser says you may.
          </p>
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
            <Icon name="check" size={15} /> Post
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------- the review queue --------------------------- */

/** One editable row: title, time, category, venue and price save as soon as you leave the field. */
function QueueRow({ d, checked, onCheck, onSaved, onOpen }: { d: DraftDTO; checked: boolean; onCheck: (v: boolean) => void; onSaved: (d: DraftDTO) => void; onOpen: () => void }) {
  const categories = useCategories();
  const toast = useToast();
  const save = async (patch: DraftPatch) => {
    try {
      onSaved((await AdminService.updateDraft(d.id, patch)).data);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const input = "h-9 w-full rounded-control border border-transparent bg-transparent px-2 text-sm hover:border-line focus:border-accent-text focus:bg-raised focus:outline-none";
  return (
    <li className={cx("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-3 lg:grid-cols-[auto_3.5rem_minmax(0,2.2fr)_11.5rem_8.5rem_minmax(0,1.4fr)_6rem_auto] lg:items-center lg:gap-y-0", checked && "bg-accent/5")}>
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${d.title}`} className="mt-2 size-4 accent-[var(--accent-text)] lg:mt-0" />
      <button type="button" onClick={onOpen} className="hidden size-14 overflow-hidden rounded-control border border-line bg-raised lg:block" aria-label={`Edit ${d.title}`}>
        {d.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.coverImage} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-muted">
            <Icon name="image" size={18} />
          </span>
        )}
      </button>
      <div className="min-w-0">
        <input defaultValue={d.title} aria-label="Title" onBlur={(e) => e.target.value.trim() !== d.title && void save({ title: e.target.value })} className={cx(input, "font-semibold")} />
        <p className="truncate px-2 font-mono text-[11px] text-ink-muted">
          {providerLabel[d.provider] ?? ""} ·{" "}
          <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {d.sourceName || new URL(d.sourceUrl).hostname}
          </a>
        </p>
      </div>
      <input type="datetime-local" defaultValue={toLocalInput(d.startsAt)} aria-label="Starts" onBlur={(e) => fromLocalInput(e.target.value) !== d.startsAt && void save({ startsAt: fromLocalInput(e.target.value) })} className={cx(input, "col-start-2 lg:col-start-auto")} />
      <select defaultValue={d.interest} aria-label="Category" onChange={(e) => void save({ interest: e.target.value as InterestId })} className={cx(input, "col-start-2 lg:col-start-auto")}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="col-start-2 min-w-0 lg:col-start-auto">
        <input defaultValue={d.venue} aria-label="Venue" placeholder="Venue" onBlur={(e) => e.target.value !== d.venue && void save({ venue: e.target.value })} className={input} />
        <p className="truncate px-2 text-[11px] text-ink-muted">{d.online ? "Online" : placeLabel({ country: d.country, region: d.region, city: d.city })}</p>
      </div>
      <p className="col-start-2 px-2 text-sm lg:col-start-auto">{formatPrice(d.price, d.currency)}</p>
      <Button size="sm" onClick={onOpen} className="col-start-2 justify-self-start lg:col-start-auto">
        Edit
      </Button>
    </li>
  );
}

function ReviewQueue({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => AdminService.drafts("pending"), [version], { keepPrevious: true });
  const mine = useApi(() => CommunityService.mine(), []);
  const targets = (mine.data ?? []).filter((c) => c.role === "owner" || c.role === "admin");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [open, setOpen] = useState<DraftDTO | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [q, setQ] = useState("");
  const list = (data ?? []).filter((d) => !q.trim() || `${d.title} ${d.venue} ${d.sourceName}`.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = list.filter((d) => selected.has(d.id));
  const allOn = list.length > 0 && shown.length === list.length;

  async function bulk(action: "approve" | "reject") {
    const ids = shown.map((d) => d.id);
    if (!ids.length) return;
    setBusy(action);
    try {
      const { data: r } = await AdminService.bulkDrafts(ids, action, target ? { communitySlug: target } : {});
      const gone = new Set(r.done.map((x) => x.id));
      setData((l) => (l ?? []).filter((x) => !gone.has(x.id)));
      setSelected(new Set([...selected].filter((id) => !gone.has(id))));
      if (r.done.length) toast(action === "approve" ? `Posted ${r.done.length} ${r.done.length === 1 ? "event" : "events"}` : `Rejected ${r.done.length}. They won't come back.`, "success");
      if (r.failed.length) toast(`${r.failed.length} couldn't be ${action === "approve" ? "posted" : "rejected"}: ${r.failed[0].title ? `“${r.failed[0].title}”: ` : ""}${r.failed[0].message}`, "error");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Skeleton className="h-40 w-full rounded-card" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) {
    return (
      <EmptyState icon="calendar" title="The queue is empty" compact>
        Run a search above, paste a link, or add pages to check every night.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(list.map((d) => d.id)) : new Set())} className="size-4 accent-[var(--accent-text)]" aria-label="Select all" />
          {shown.length ? `${shown.length} selected` : `${list.length} waiting`}
        </label>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter the queue" className="h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-3 text-sm sm:max-w-56" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Post to" className="h-9 max-w-52 rounded-control border border-line bg-raised px-2 text-sm">
            <option value="">Post to Klique (everyone)</option>
            {targets.map((c) => (
              <option key={c.id} value={c.slug}>
                Post to {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={!shown.length || !!busy} loading={busy === "approve"} onClick={() => void bulk("approve")}>
            <Icon name="check" size={14} /> Post {shown.length || ""}
          </Button>
          <Button size="sm" variant="danger" disabled={!shown.length || !!busy} loading={busy === "reject"} onClick={() => void bulk("reject")}>
            Reject {shown.length || ""}
          </Button>
        </div>
      </div>
      <div className="hidden grid-cols-[auto_3.5rem_minmax(0,2.2fr)_11.5rem_8.5rem_minmax(0,1.4fr)_6rem_auto] gap-x-3 border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase lg:grid">
        <span className="w-4" />
        <span />
        <span className="px-2">Event</span>
        <span className="px-2">Starts (your time)</span>
        <span className="px-2">Category</span>
        <span className="px-2">Where</span>
        <span className="px-2">Price</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {list.map((d) => (
          <QueueRow
            key={d.id}
            d={d}
            checked={selected.has(d.id)}
            onCheck={(v) => setSelected((s) => (v ? new Set(s).add(d.id) : new Set([...s].filter((x) => x !== d.id))))}
            onSaved={(next) => setData((l) => (l ?? []).map((x) => (x.id === next.id ? next : x)))}
            onOpen={() => setOpen(d)}
          />
        ))}
      </ul>
      {open && (
        <DraftEditor
          draft={open}
          target={target}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            setOpen(null);
            setData((l) => (next ? (l ?? []).map((x) => (x.id === next.id ? next : x)) : (l ?? []).filter((x) => x.id !== open.id)));
            if (!next) onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------- history ------------------------------- */

function DraftRow({ d }: { d: DraftDTO }) {
  const where = d.online ? "Online" : [d.venue, placeLabel({ country: d.country, region: d.region, city: d.city })].filter(Boolean).join(" · ");
  return (
    <article className="flex gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
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
        {d.eventId ? (
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

function History({ status }: { status: Exclude<DraftStatus, "pending"> }) {
  const { data, loading, error, reload } = useApi(() => AdminService.drafts(status), [status]);
  if (loading) return <Skeleton className="h-28 w-full rounded-card" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.length) {
    return (
      <EmptyState icon="calendar" title="Nothing here" compact>
        {status === "approved" ? "Events you post are listed here." : "Events you reject are listed here, and the finder won't bring them back."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <DraftRow key={d.id} d={d} />
      ))}
    </div>
  );
}

/* ------------------------------- the page ------------------------------- */

export function EventInbox({ pending, onChanged }: { pending: number | null; onChanged: () => void }) {
  const [status, setStatus] = useState<DraftStatus>("pending");
  const [version, setVersion] = useState(0);
  const [searchesVersion, setSearchesVersion] = useState(0);
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    onChanged();
  }, [onChanged]);
  const runner = useRunner(refresh);
  const busy = runner.run?.status === "running";
  return (
    <div className="space-y-5">
      <FinderSearch busy={busy} onRun={runner.start} onSaved={() => setSearchesVersion((v) => v + 1)} />
      {runner.run && <RunProgress run={runner.run} onClose={runner.clear} />}
      <section className="space-y-4">
        <Segmented
          label="Draft status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "pending", label: "To review", count: pending },
            { id: "approved", label: "Posted" },
            { id: "rejected", label: "Rejected" },
          ]}
        />
        {status === "pending" ? <ReviewQueue version={version} onChanged={onChanged} /> : <History status={status} />}
      </section>
      <SavedSearches version={searchesVersion} busy={busy} onRun={runner.start} />
      <Sources busy={busy} onRun={runner.start} />
    </div>
  );
}

