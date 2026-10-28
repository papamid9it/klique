"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage } from "@/app/ApiCore";
import { CampaignService } from "@/app/services/CampaignService";
import { CommunityService } from "@/app/services/CommunityService";
import { EventService } from "@/app/services/EventService";
import { CampaignPreview } from "@/components/domain/ads/CampaignParts";
import { PanelLayout } from "@/components/layout/PanelLayout";
import { AdsMobileBar, AdsPanel } from "@/components/domain/ads/AdsManager";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { AD_PLACEMENTS, AD_REACHES, adPrice, type AdPlacement, type AdReach } from "@/lib/ads";
import { KLIQUE_SLUG } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { cityName, countryName } from "@/lib/places";
import type { AdCampaignInput } from "@/lib/types";

type Kind = "event" | "community" | "brand";
const KINDS: { id: Kind; title: string; hint: string; icon: "calendar" | "users" | "megaphone" }[] = [
  { id: "event", title: "A Klique event", hint: "One of Klique's own events (the ones everyone sees). Other events are for their community's members.", icon: "calendar" },
  { id: "community", title: "A community", hint: "One you own or run, so more people join.", icon: "users" },
  { id: "brand", title: "Your own ad", hint: "A picture, a headline and a link: a business, a product, a shop.", icon: "megaphone" },
];

const toDateInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

/**
 * Create (or change) an ad: what to promote, where on Klique, how far it reaches, for how many days. The price
 * updates as you choose; the server works it out again from the admin's price list when you send it.
 * ?event=<id> or ?community=<slug> start with that picked; ?edit=<id> changes one you sent; ?again=<id> copies one.
 */
function NewAdForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { status, user, requireAuth } = useAuth();
  const authed = status === "authed";
  const editId = sp.get("edit");
  const copyId = editId ?? sp.get("again");

  const pricing = useApi(() => CampaignService.pricing(), [], { key: "ad-pricing" });
  const hosted = useApi(authed ? () => EventService.list({ scope: "hosted", page: 1 }) : null, [authed]);
  const mine = useApi(authed ? () => CommunityService.mine() : null, [authed], { key: "my-communities" });
  const original = useApi(authed && copyId ? () => CampaignService.get(copyId) : null, [authed, copyId]);

  const [kind, setKind] = useState<Kind>(sp.get("community") ? "community" : sp.get("event") ? "event" : "community");
  const [eventId, setEventId] = useState(sp.get("event") ?? "");
  const [communitySlug, setCommunitySlug] = useState(sp.get("community") ?? "");
  const [advertiser, setAdvertiser] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Learn more");
  const [url, setUrl] = useState("");
  const [placements, setPlacements] = useState<AdPlacement[]>(["home-feed", "events-list"]);
  const [reach, setReach] = useState<AdReach>("city");
  const [days, setDays] = useState("7");
  const [startOn, setStartOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anon") requireAuth({ redirect: true });
  }, [status, requireAuth]);

  // editing or running again: start from that ad
  const o = original.data;
  useEffect(() => {
    if (!o) return;
    setKind(o.kind);
    setEventId(o.event?.id ?? "");
    setCommunitySlug(o.community?.slug ?? "");
    setAdvertiser(o.kind === "brand" ? o.advertiser : "");
    setTitle(o.kind === "event" ? "" : o.title);
    setBody(o.kind === "event" ? "" : o.body);
    setImageUrl(o.kind === "brand" ? (o.imageUrl ?? "") : "");
    setCtaLabel(o.ctaLabel);
    setUrl(o.kind === "brand" ? o.url : "");
    setPlacements(o.placements as AdPlacement[]);
    setReach(o.reach);
    setDays(String(o.days));
    setStartOn(editId ? toDateInput(o.startOn) : "");
  }, [o, editId]);

  // what can be promoted
  // only Klique's events reach everyone; a community's events are for its members, so they can't be advertised
  const events = (hosted.data?.items ?? []).filter((e) => e.community?.official && !e.subcommunity && !e.isPast);
  const extraEvent = useApi(eventId && !events.some((e) => e.id === eventId) ? () => EventService.get(eventId) : null, [eventId, events.length]);
  const eventChoices = extraEvent.data && !events.some((e) => e.id === extraEvent.data!.id) ? [extraEvent.data, ...events] : events;
  const communities = (mine.data ?? []).filter((c) => (c.role === "owner" || c.role === "admin") && c.privacy === "public" && c.slug !== KLIQUE_SLUG); // everyone is already in Klique
  const pickedEvent = eventChoices.find((e) => e.id === eventId) ?? null;
  const pickedCommunity = useApi(kind === "community" && communitySlug ? () => CommunityService.get(communitySlug) : null, [kind, communitySlug]);

  // where it shows: the place of what's promoted, or where you live for your own ad
  const home = kind === "event" && pickedEvent ? { country: pickedEvent.country, city: pickedEvent.city } : kind === "community" && pickedCommunity.data ? { country: pickedCommunity.data.country, city: pickedCommunity.data.city } : { country: user?.country ?? "NG", city: user?.city ?? "lagos" };
  const place = reach === "city" ? `city:${home.country}:${home.city}` : reach === "country" ? `country:${home.country}` : null;
  const placeName = reach === "city" ? cityName(home.country, home.city) : reach === "country" ? countryName(home.country) : "everywhere";

  const p = pricing.data;
  const nDays = Math.max(0, Math.round(Number(days) || 0));
  const total = p ? adPrice(p, placements, reach, nDays) : 0;
  const perDay = p ? adPrice(p, placements, reach, 1) : 0;

  const pc = pickedCommunity.data;
  const preview =
    kind === "event"
      ? { kind, advertiser: "", title: pickedEvent?.title ?? "", body: "", imageUrl: pickedEvent?.coverImage ?? null, ctaLabel: "See event" }
      : kind === "community"
        ? { kind, advertiser: pc?.name ?? "", title: title || (pc ? `Join ${pc.name}` : ""), body: body || (pc?.description ?? "").slice(0, 200), imageUrl: pc?.coverImage ?? null, ctaLabel: "Join" }
        : { kind, advertiser, title, body, imageUrl: imageUrl || null, ctaLabel };

  const toggle = (id: AdPlacement) => setPlacements((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuth()) return;
    setFormError(null);
    const input: AdCampaignInput = {
      kind,
      eventId: kind === "event" ? eventId : undefined,
      communitySlug: kind === "community" ? communitySlug : undefined,
      advertiser: kind === "brand" ? advertiser : undefined,
      title: kind === "event" ? undefined : title,
      body: kind === "event" ? undefined : body,
      imageUrl: kind === "brand" ? imageUrl || null : undefined,
      ctaLabel: kind === "brand" ? ctaLabel : undefined,
      url: kind === "brand" ? url : undefined,
      placements,
      reach,
      place,
      days: nDays,
      startOn: startOn ? new Date(`${startOn}T09:00:00+01:00`).toISOString() : null,
    };
    setBusy(true);
    try {
      if (editId) await CampaignService.update(editId, input);
      else await CampaignService.submit(input);
      toast(editId ? "Changes sent for review" : "Sent for review. We'll notify you.", "success");
      router.push("/ads");
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  if (status === "loading" || pricing.loading || (copyId && original.loading)) return <Skeleton className="h-96" />;

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <div className="min-w-0 space-y-7">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold">What do you want to promote?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label key={k.id} className={cx("flex cursor-pointer flex-col gap-1.5 rounded-card border bg-surface p-3.5 transition", kind === k.id ? "border-accent-text" : "border-line hover:border-ink-muted/50")}>
                <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
                <Icon name={k.icon} size={18} className="text-accent-text" />
                <span className="text-sm font-semibold">{k.title}</span>
                <span className="text-xs text-ink-muted">{k.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "event" && (
          <SelectField label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)} hint={eventChoices.length ? "Upcoming Klique events you host." : "Only Klique's own events can be advertised: a community's events are for its members. Promote your community instead, and people who join will see its events."}>
            <option value="">Pick an event</option>
            {eventChoices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </SelectField>
        )}
        {kind === "community" && (
          <div className="space-y-4">
            <SelectField label="Community" value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} hint={communities.length ? "Public communities you own or run." : "You don't run a public community yet."}>
              <option value="">Pick a community</option>
              {communities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={pickedCommunity.data ? `Join ${pickedCommunity.data.name}` : "Join us"} />
            <TextArea label="Text (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} counter={200} placeholder="Uses the community's description if you leave it empty." />
          </div>
        )}
        {kind === "brand" && (
          <div className="space-y-4">
            <TextField label="Who it's from" value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} maxLength={80} placeholder="Your business or brand" hint='Shown next to "Sponsored".' />
            <TextField label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What you want people to know" />
            <TextArea label="Text (optional)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} counter={200} />
            <ImageField kind="photo" label="Picture (optional)" value={imageUrl} onChange={setImageUrl} hint="A wide picture works best." />
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <TextField label="Button" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={24} />
              <TextField label="Link" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </div>
          </div>
        )}

        <fieldset>
          <legend className="mb-1 text-base font-semibold">Where on Klique</legend>
          <p className="mb-3 text-sm text-ink-muted">Pick one or more. Prices are per day.</p>
          <div className="space-y-2">
            {AD_PLACEMENTS.map((pl) => (
              <label key={pl.id} className={cx("flex cursor-pointer items-center gap-3 rounded-control border bg-surface p-3 transition", placements.includes(pl.id) ? "border-accent-text" : "border-line")}>
                <input type="checkbox" checked={placements.includes(pl.id)} onChange={() => toggle(pl.id)} className="size-4 accent-[var(--accent-text)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{pl.label}</span>
                  <span className="block text-xs text-ink-muted">{pl.hint}</span>
                </span>
                <span className="shrink-0 font-mono text-sm">{p ? formatPrice(p.perDay[pl.id], "NGN") : ""}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-base font-semibold">Who sees it</legend>
          <p className="mb-3 text-sm text-ink-muted">Based on {kind === "brand" ? "where you live" : "where it is"}. Wider reach costs more.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {AD_REACHES.map((r) => (
              <label key={r.id} className={cx("flex cursor-pointer flex-col gap-1 rounded-control border bg-surface p-3 transition", reach === r.id ? "border-accent-text" : "border-line")}>
                <input type="radio" name="reach" className="sr-only" checked={reach === r.id} onChange={() => setReach(r.id)} />
                <span className="text-sm font-semibold">{r.id === "city" ? cityName(home.country, home.city) : r.id === "country" ? countryName(home.country) : "Everywhere"}</span>
                <span className="text-xs text-ink-muted">{r.hint}</span>
                {p && p.reach[r.id] !== 1 && <span className="font-mono text-[11px] text-ink-muted">×{p.reach[r.id]}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="How many days" type="number" inputMode="numeric" min={p?.minDays ?? 1} max={p?.maxDays ?? 30} value={days} onChange={(e) => setDays(e.target.value)} hint={p ? `${p.minDays} to ${p.maxDays} days.` : undefined} />
          <TextField label="Start on (optional)" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} hint="Leave empty to start as soon as it's paid." />
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <CampaignPreview c={preview} />
        <div className="space-y-2 rounded-card border border-line bg-surface p-4">
          <p className="flex justify-between text-sm">
            <span className="text-ink-muted">Per day</span>
            <span className="font-mono">{formatPrice(perDay, "NGN")}</span>
          </p>
          <p className="flex justify-between text-sm">
            <span className="text-ink-muted">Days</span>
            <span className="font-mono">× {nDays}</span>
          </p>
          <p className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">{formatPrice(total, "NGN")}</span>
          </p>
          <p className="text-xs text-ink-muted">
            Shown {placeName === "everywhere" ? "everywhere" : `in ${placeName}`}. You only pay after an admin approves it.
          </p>
          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!placements.length || !nDays}>
            {editId ? "Send changes for review" : "Send for review"}
          </Button>
          <Button href="/ads" variant="ghost" className="w-full">
            Cancel
          </Button>
        </div>
      </aside>
    </form>
  );
}

export default function NewAdPage() {
  return (
    <PanelLayout panel={<AdsPanel tab="create" />} mobile={<AdsMobileBar tab="create" />}>
      <header className="mb-6">
        <p className="eyebrow mb-1.5">Ads Manager</p>
        <h1 className="text-[clamp(1.6rem,3vw,2.1rem)] font-bold tracking-[-0.03em]">Create ad</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">Tell people about your event, community or business. The Klique team checks every ad before it runs, and you only pay once it&apos;s approved.</p>
      </header>
      <Suspense fallback={null}>
        <NewAdForm />
      </Suspense>
    </PanelLayout>
  );
}
