"use client";

import { useCategories } from "@/lib/hooks/useCategories";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdService } from "@/app/services/AdService";
import { AdminService } from "@/app/services/AdminService";
import { SponsoredBox, SponsoredCard, SponsoredCommunity } from "@/components/domain/ads/Sponsored";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { SlideOver } from "@/components/ui/SlideOver";
import { cx } from "@/components/ui/cx";
import { type InterestId } from "@/lib/constants";
import { formatDateShort } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import { parseScope, scopeLabel, type Place } from "@/lib/places";
import type { AdDTO, AdInput, AdminAdDTO, AdminCommunityRow, AdminEventRow, AdSlot } from "@/lib/types";

export const SLOTS: { id: AdSlot; label: string; hint: string }[] = [
  { id: "home-feed", label: "Home feed", hint: "A card between posts in the home feed, every few posts (phones and desktop)" },
  { id: "home-rail", label: "Home side box", hint: "Right column of the home page, desktop only" },
  { id: "events-list", label: "Events list", hint: "Top of the list, and once further down" },
  { id: "event-page", label: "Event page", hint: "Partner box under “I'm going”. No picture." },
  { id: "search", label: "Search", hint: "First result, when the search words match" },
  { id: "communities", label: "Sponsored communities", hint: "“Sponsored communities” on the Communities page (sponsored communities only)" },
];

function CommunityPicker({ value, onPick }: { value: AdminAdDTO["community"]; onPick: (c: AdminCommunityRow) => void }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const { data, loading } = useApi(() => AdminService.communities({ q: query, sort: "members" }), [query]);
  const list = (data?.items ?? []).filter((c) => c.privacy === "public").slice(0, 6);
  return (
    <div className="space-y-2">
      {value && (
        <p className="rounded-control border border-line bg-raised/50 px-3 py-2 text-sm">
          <span className="text-ink-muted">Sponsoring:</span> <span className="font-semibold">{value.name}</span>
        </p>
      )}
      <TextField label={value ? "Pick a different community" : "Community to sponsor"} type="search" placeholder="Search public communities" value={q} onChange={(e) => setQ(e.target.value)} hint="Shown under “Sponsored communities” on the Communities page, to people who aren't in it yet." />
      <ul className="divide-y divide-line rounded-control border border-line">
        {loading && !list.length ? (
          <li className="px-3 py-2 text-sm text-ink-muted">Loading…</li>
        ) : list.length ? (
          list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-raised/60", value?.id === c.id && "bg-raised")}>
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-muted">{c.memberCount} members</span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-ink-muted">No public communities match.</li>
        )}
      </ul>
    </div>
  );
}

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** A Place from the picker → a scope string ("city:NG:lagos", "region:NG:lagos", "country:NG"). */
const placeToScope = (p: Place) => (p.city ? `city:${p.country}:${p.city}` : p.region ? `region:${p.country}:${p.region}` : `country:${p.country}`);
const placeName = (s: string) => {
  const scope = parseScope(s);
  return scope ? scopeLabel(scope) : s;
};

function EventPicker({ value, onPick }: { value: AdminAdDTO["event"]; onPick: (e: AdminEventRow) => void }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const { data, loading } = useApi(() => AdminService.events({ filter: "upcoming", q: query }), [query]);
  const list = (data?.items ?? []).filter((e) => e.audience === "public").slice(0, 6);
  return (
    <div className="space-y-2">
      {value && (
        <p className="rounded-control border border-line bg-raised/50 px-3 py-2 text-sm">
          <span className="text-ink-muted">Promoting:</span> <span className="font-semibold">{value.title}</span> · {formatDateShort(value.startsAt)}
        </p>
      )}
      <TextField label={value ? "Pick a different event" : "Event to promote"} type="search" placeholder="Search upcoming public events" value={q} onChange={(e) => setQ(e.target.value)} hint="Only Klique's own events can be promoted: a community's events are for its members." />
      <ul className="divide-y divide-line rounded-control border border-line">
        {loading && !list.length ? (
          <li className="px-3 py-2 text-sm text-ink-muted">Loading…</li>
        ) : list.length ? (
          list.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className={cx("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-raised/60", value?.id === e.id && "bg-raised")}>
                <span className="min-w-0 truncate font-medium">{e.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-muted">{formatDateShort(e.startsAt)}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-ink-muted">No upcoming public events match.</li>
        )}
      </ul>
    </div>
  );
}

/** Create or edit an ad, with a live preview of how it looks in the app. */
export function AdEditor({ ad, onClose, onSaved }: { ad: AdminAdDTO | "new"; onClose: () => void; onSaved: (a: AdminAdDTO) => void }) {
  const categories = useCategories();
  const toast = useToast();
  const start = ad === "new" ? null : ad;
  const [f, setF] = useState({
    name: start?.name ?? "",
    kind: (start?.kind ?? "event") as "event" | "brand" | "community",
    event: start?.event ?? null,
    community: start?.community ?? null,
    advertiser: start?.advertiser ?? "",
    title: start?.title ?? "",
    body: start?.body ?? "",
    imageUrl: start?.imageUrl ?? "",
    ctaLabel: start?.ctaLabel ?? "",
    url: start?.url ?? "",
    slots: start?.slots ?? (["home-feed", "events-list"] as AdSlot[]),
    places: start?.places ?? [],
    interests: start?.interests ?? ([] as InterestId[]),
    keywords: (start?.keywords ?? []).join(", "),
    startsAt: toLocal(start?.startsAt),
    endsAt: toLocal(start?.endsAt),
    weight: start?.weight ?? 5,
  });
  const [place, setPlace] = useState<Place>({ country: "NG", region: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const input = (): AdInput => ({
    name: f.name.trim(),
    kind: f.kind,
    eventId: f.kind === "event" ? (f.event?.id ?? null) : null,
    communityId: f.kind === "community" ? (f.community?.id ?? null) : null,
    advertiser: f.advertiser,
    title: f.title,
    body: f.body,
    imageUrl: f.imageUrl.trim() || null,
    ctaLabel: f.ctaLabel,
    url: f.url.trim(),
    slots: f.kind === "community" ? ["communities"] : f.slots.filter((s) => s !== "communities"),
    places: f.places,
    interests: f.interests,
    keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
    startsAt: fromLocal(f.startsAt),
    endsAt: fromLocal(f.endsAt),
    weight: f.weight,
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { data } = start ? await AdService.update(start.id, input()) : await AdService.create(input());
      toast(start ? "Ad saved" : data.live ? "Ad created. It's live now." : "Ad created", "success");
      onSaved(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // what the preview shows: the same components the app uses
  const preview: AdDTO = {
    id: "preview",
    kind: f.kind,
    advertiser: f.kind === "event" ? f.advertiser || "Event host" : f.advertiser || "Advertiser",
    title: (f.kind === "event" ? f.title || f.event?.title : f.title) || "Your headline",
    body: f.kind === "event" ? (f.event ? formatDateShort(f.event.startsAt) : "Pick an event") : f.body || "A short line about the offer.",
    imageUrl: f.imageUrl || null,
    ctaLabel: f.ctaLabel || (f.kind === "event" ? "See event" : "Learn more"),
    url: f.kind === "brand" ? f.url || "#" : null,
    event: null,
    community: f.kind === "community" ? { id: f.community?.id ?? "preview", slug: f.community?.slug ?? "", name: f.community?.name ?? "Pick a community", interest: "music", coverImage: f.imageUrl || null, memberCount: 0 } : null,
  };

  return (
    <SlideOver open onClose={onClose} side="right" title={start ? "Edit ad" : "New ad"} wide>
      <div className="space-y-6 p-5 pt-6 sm:p-6">
        <h2 className="pr-10 text-lg font-semibold">{start ? `Edit “${start.name}”` : "New ad"}</h2>

        <TextField label="Name (only admins see this)" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="e.g. FlexRide October" required />

        <div role="radiogroup" aria-label="Kind of ad" className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "event", label: "Promoted event", hint: "Push an event on Klique" },
              { id: "brand", label: "Brand ad", hint: "Picture, text and a link" },
              { id: "community", label: "Sponsored community", hint: "On the Communities page" },
            ] as const
          ).map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={f.kind === k.id} onClick={() => set("kind", k.id)} className={cx("rounded-control border px-3 py-2.5 text-left", f.kind === k.id ? "border-accent-text bg-raised" : "border-line hover:bg-raised/50")}>
              <span className="block text-sm font-semibold">{k.label}</span>
              <span className="block text-xs text-ink-muted">{k.hint}</span>
            </button>
          ))}
        </div>

        {f.kind === "community" ? (
          <section className="space-y-3">
            <CommunityPicker value={f.community} onPick={(c) => set("community", { id: c.id, slug: c.slug, name: c.name })} />
            <ImageField kind="photo" label="Picture (optional)" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} hint="Leave empty to use the community's own picture." />
          </section>
        ) : f.kind === "event" ? (
          <section className="space-y-3">
            <EventPicker value={f.event} onPick={(e) => set("event", { id: e.id, title: e.title, startsAt: e.startsAt, cancelled: e.cancelled })} />
            <TextField label="Headline (optional)" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} hint="Leave empty to use the event's title." />
            <TextField label="Shown as from (optional)" value={f.advertiser} onChange={(e) => set("advertiser", e.target.value)} maxLength={80} hint="Leave empty to use the organiser or community." />
          </section>
        ) : (
          <section className="space-y-3">
            <TextField label="Advertiser" value={f.advertiser} onChange={(e) => set("advertiser", e.target.value)} maxLength={80} placeholder="e.g. FlexRide" required />
            <TextField label="Headline" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="e.g. 20% off your ride to the event" required />
            <TextArea label="Text" value={f.body} onChange={(e) => set("body", e.target.value)} maxLength={200} rows={2} placeholder="e.g. Use code KLIQUE20 · Lagos & Abuja" />
            <ImageField kind="photo" label="Picture" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} hint="Wide pictures work best (16:9)." />
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <TextField label="Button" value={f.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} maxLength={24} placeholder="Learn more" />
              <TextField label="Link" type="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" required />
            </div>
          </section>
        )}

        {f.kind !== "community" && <section>
          <h3 className="eyebrow mb-2">Where it shows</h3>
          <div className="space-y-1.5">
            {SLOTS.filter((s) => s.id !== "communities").map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-control border border-line px-3 py-2 has-[:checked]:border-accent-text">
                <input type="checkbox" checked={f.slots.includes(s.id)} onChange={() => set("slots", toggle(f.slots, s.id))} className="mt-1 accent-[var(--accent-text)]" />
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-ink-muted">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>}

        <section className="space-y-3">
          <h3 className="eyebrow">Who sees it</h3>
          <div>
            <p className="text-sm font-medium">Places</p>
            <p className="text-xs text-ink-muted">{f.places.length ? "Shown to people browsing these places (or a place inside them)." : "Everywhere. Add places to narrow it down."}</p>
            {f.places.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.places.map((p) => (
                  <button key={p} type="button" onClick={() => set("places", f.places.filter((x) => x !== p))} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-raised px-3 text-[13px]" aria-label={`Remove ${placeName(p)}`}>
                    {placeName(p)} <Icon name="x" size={12} />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-control border border-dashed border-line p-3">
              <PlaceFields value={place} onChange={setPlace} />
              <Button size="sm" className="mt-3" onClick={() => set("places", [...new Set([...f.places, placeToScope(place)])])}>
                <Icon name="plus" size={13} /> Add {place.city || place.region ? "this place" : "this country"}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Scenes</p>
            <p className="text-xs text-ink-muted">{f.interests.length ? "Shown to people into these scenes, or browsing them." : "Every scene."}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categories.map((i) => (
                <button key={i.id} type="button" aria-pressed={f.interests.includes(i.id)} onClick={() => set("interests", toggle(f.interests, i.id))} className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", f.interests.includes(i.id) ? "border-transparent bg-accent text-accent-ink" : "border-line text-ink-muted hover:text-ink")}>
                  <span aria-hidden="true">{i.glyph}</span> {i.short}
                </button>
              ))}
            </div>
          </div>
          {f.slots.includes("search") && <TextField label="Search words" value={f.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="skate, sneakers, board" hint="Comma-separated. In search, the ad only shows when one of these is searched. Leave empty for any search." />}
        </section>

        <section className="space-y-3">
          <h3 className="eyebrow">When</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Starts (optional)" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} hint="Empty = now" />
            <TextField label="Ends (optional)" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} hint="Empty = until you pause it" />
          </div>
          <label className="block">
            <span className="flex justify-between text-sm font-medium">
              Priority <span className="font-mono text-ink-muted">{f.weight}/10</span>
            </span>
            <input type="range" min={1} max={10} value={f.weight} onChange={(e) => set("weight", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent-text)]" />
            <span className="text-xs text-ink-muted">When several ads fit the same spot, higher priority shows more often.</span>
          </label>
        </section>

        <section>
          <h3 className="eyebrow mb-2">Preview</h3>
          {f.kind === "community" ? (
            <div className="pointer-events-none max-w-xs">
              <SponsoredCommunity ad={preview} />
            </div>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="pointer-events-none">
              <SponsoredCard ad={preview} />
            </div>
            <div className="pointer-events-none space-y-2">
              <SponsoredBox ad={preview} />
              <p className="text-xs text-ink-muted">{f.kind === "event" ? "Promoted events use the event's own picture." : ""}</p>
            </div>
          </div>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-line bg-canvas px-5 py-3 sm:-mx-6 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            {start ? "Save ad" : "Create ad"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
