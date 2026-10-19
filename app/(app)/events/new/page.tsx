"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { EventService, type EventInput } from "@/app/services/EventService";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { PageTitle } from "@/components/layout/PageTitle";
import { useAuth } from "@/components/providers/AuthProvider";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { usePlace } from "@/components/providers/PlaceProvider";
import { currencyOf, type Place } from "@/lib/places";
import { ImageField } from "@/components/ui/ImageField";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { INTERESTS, LIMITS, isInterestId, type InterestId } from "@/lib/constants";
import { CURRENCIES, formatPrice } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";

function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function NewEventForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, requireAuth, user } = useAuth();
  const { scope, home } = usePlace();
  // Start from where they are looking (or their own city) when that is specific enough.
  const start0 = scope.level === "city" ? scope : home;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interest, setInterest] = useState<InterestId>("skate");
  const [place, setPlace] = useState<Place>(() => {
    const base = start0.level === "city" ? { country: start0.country, city: start0.city } : { country: user?.country ?? "NG", city: user?.city ?? "" };
    return { country: base.country, region: "", city: base.city };
  });
  const [online, setOnline] = useState(false);
  const [currency, setCurrency] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [cover, setCover] = useState("");
  const [communitySlug, setCommunitySlug] = useState(params.get("community") ?? "");
  const [subSlug, setSubSlug] = useState(params.get("sub") ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anon") requireAuth();
  }, [status, requireAuth]);

  // where this person may host: public events, and/or the communities (or groups) they run
  const hosting = useApi(status === "authed" ? () => EventService.hosting() : null, [status]);
  const communities = useMemo(() => hosting.data?.communities ?? [], [hosting.data]);
  const canPublic = !!hosting.data?.public.allowed;
  // Not allowed to post public events: start in the first community they can host in.
  useEffect(() => {
    if (hosting.data && !hosting.data.public.allowed && !communitySlug && hosting.data.communities[0]) setCommunitySlug(hosting.data.communities[0].slug);
  }, [hosting.data, communitySlug]);
  const groups = useApi(communitySlug ? () => SubcommunityService.list(communitySlug) : null, [communitySlug]);
  const subs = useMemo(() => (communitySlug ? groups.data ?? [] : []), [communitySlug, groups.data]);
  const pickedCommunity = communities.find((c) => c.slug === communitySlug);
  const groupsOnly = !!pickedCommunity?.groupsOnly;
  const pickedSub = subs.find((s) => s.slug === subSlug);
  const privateSpace = pickedCommunity?.privacy === "private" || pickedSub?.visibility === "private";

  const priceNum = Math.max(0, Math.round(Number(price) || 0));
  const cur = currency ?? currencyOf(place.country);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuth()) return;
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your event a title.";
    if (!venue.trim()) next.venue = online ? "Where do people join? A link or a platform name." : "Where is it happening?";
    if (!place.city) next.city = "Which city or town is it in?";
    const startsAt = toIso(date, start);
    if (!date) next.date = "Pick a date.";
    if (!start) next.startsAt = "Pick a start time.";
    let endsAt: string | null = null;
    if (end) {
      endsAt = toIso(date, end);
      if (endsAt && startsAt && endsAt <= startsAt) next.endsAt = "End time must be after the start.";
    }
    const cap = capacity.trim() ? Math.round(Number(capacity)) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap < 1)) next.capacity = "Capacity must be 1 or more.";
    if (Object.keys(next).length || !startsAt) {
      setErrors(next);
      setFormError(null);
      return;
    }
    const input: EventInput = {
      title: title.trim(),
      description: description.trim(),
      interest,
      ...place,
      neighborhood,
      online,
      currency: cur,
      venue: venue.trim(),
      startsAt,
      endsAt,
      priceNaira: priceNum,
      capacity: cap,
      coverImage: cover.trim() || null,
      communitySlug: communitySlug || undefined,
      subSlug: communitySlug && subSlug ? subSlug : undefined,
    };
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await EventService.create(input);
      router.push(`/events/${res.data.id}`);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  if (status === "loading" || (status === "authed" && hosting.loading)) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (hosting.data && !canPublic && communities.length === 0) {
    return (
      <div className="max-w-xl space-y-4 rounded-card border border-line bg-surface p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-raised text-accent-text">
          <Icon name="calendar" size={20} />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Hosting opens up as your community grows</h2>
        <p className="text-sm text-ink-muted">
          Events on Klique are posted by community owners and admins, by verified hosts, and by owners of communities with {hosting.data.public.minMembers}+ members. Start a community, or ask the admins of one you&apos;re in to post your event.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button href="/communities/new" variant="primary">Start a community</Button>
          <Button href="/events">Browse events</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5" noValidate>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.eventTitle} error={errors.title} placeholder="Sunday sunset skate" />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.eventDescription} counter={LIMITS.eventDescription} error={errors.description} hint="What should people expect? What should they bring?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Interest" value={interest} onChange={(e) => isInterestId(e.target.value) && setInterest(e.target.value)} error={errors.interest}>
          {INTERESTS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-raised p-3.5 has-[:checked]:border-accent-text">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="mt-1 accent-[var(--accent-text)]" />
        <span>
          <span className="block text-sm font-semibold">This is an online event</span>
          <span className="block text-xs text-ink-muted">It still shows under your city, but is marked Online and can be filtered.</span>
        </span>
      </label>
      <PlaceFields value={place} onChange={setPlace} neighborhood={neighborhood} onNeighborhood={setNeighborhood} errors={errors} />
      <TextField label={online ? "Where to join" : "Venue"} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={LIMITS.venue} error={errors.venue} placeholder={online ? "Zoom, Google Meet, a Discord link…" : "Name of the spot"} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextField label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} error={errors.startsAt} />
        <TextField label="Ends (optional)" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.endsAt} />
      </div>
      <p className="-mt-3 text-xs text-ink-muted">Times are shown in West Africa Time (Lagos) for now.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <SelectField label="Currency" value={cur} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currencyOf(place.country), ...CURRENCIES])].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </SelectField>
          <TextField label="Price" type="number" inputMode="numeric" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} error={errors.priceNaira} hint={`Shown as: ${formatPrice(priceNum, cur)}. Use 0 for free.`} />
        </div>
        <TextField label="Capacity (optional)" type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} hint="Leave empty for unlimited spots." />
      </div>
      <ImageField kind="photo" label="Cover image (optional)" value={cover} onChange={setCover} error={errors.coverImage} hint="A wide picture works best. We'll use artwork if you skip it." />

      {communities.length > 0 && (
        <fieldset className="space-y-4 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 text-[13px] font-medium">{canPublic ? "Host in a community (optional)" : "Where it's posted"}</legend>
          <SelectField
            label="Community"
            value={communitySlug}
            onChange={(e) => {
              setCommunitySlug(e.target.value);
              setSubSlug("");
            }}
            error={errors.communitySlug}
          >
            {canPublic && <option value="">No community — public event</option>}
            {communities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {communitySlug && subs.length > 0 && (
            <SelectField label="Group" value={subSlug} onChange={(e) => setSubSlug(e.target.value)} error={errors.subSlug}>
              {groupsOnly ? <option value="">Pick a group you run</option> : <option value="">Whole community</option>}
              {subs.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          )}
          {privateSpace && (
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
              This space is private, so the event will be members-only. Only people inside it can see it.
            </p>
          )}
        </fieldset>
      )}
      {communities.length > 0 && (
        <p className="text-xs text-ink-muted">Events in private communities and groups are members-only. Anything else is public.</p>
      )}

      {formError && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      )}
      {formError && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm font-medium text-danger">
          Please fix the highlighted fields.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={status !== "authed"}>
          Publish event
        </Button>
        <Button size="lg" href="/events">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function NewEventPage() {
  return (
    <div>
      <PageTitle title="Host a thing" eyebrow="New event">
        Tell people where to be and when.
      </PageTitle>
      <Suspense fallback={null}>
        <NewEventForm />
      </Suspense>
    </div>
  );
}
