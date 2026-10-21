"use client";

import { useCategories } from "@/lib/hooks/useCategories";
import { KLIQUE_SLUG } from "@/lib/constants";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { CommunityService } from "@/app/services/CommunityService";
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
import { LIMITS, isInterestId, type InterestId } from "@/lib/constants";
import { CURRENCIES, formatPrice } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks/useApi";

function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function NewEventForm() {
  const categories = useCategories();
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

  // Events are posted from inside a community by its owner and admins (a group's by the group's), for that
  // community's members only. Site admins can pick any community; left empty, it goes into Klique, the default
  // community everyone's in, and everyone sees it.
  const hosting = useApi(status === "authed" ? () => EventService.hosting() : null, [status]);
  const communities = useMemo(() => hosting.data?.communities ?? [], [hosting.data]);
  const siteAdmin = !!hosting.data?.siteAdmin;
  // the admin's pick (name and privacy) when it isn't one of their own communities
  const adminPick = useApi(siteAdmin && communitySlug && !communities.some((c) => c.slug === communitySlug) ? () => CommunityService.get(communitySlug) : null, [siteAdmin, communitySlug]);
  const groups = useApi(communitySlug ? () => SubcommunityService.list(communitySlug) : null, [communitySlug]);
  // only groups they run (owners/admins; the community's owner and site admins oversee every group)
  const subs = useMemo(() => (communitySlug ? (groups.data ?? []).filter((g) => g.viewer.canManage) : []), [communitySlug, groups.data]);
  const own = communities.find((c) => c.slug === communitySlug);
  const pickedCommunity = own ?? (adminPick.data ? { slug: adminPick.data.slug, name: adminPick.data.name, privacy: adminPick.data.privacy, groupsOnly: false } : undefined);
  const groupsOnly = !!pickedCommunity?.groupsOnly && !siteAdmin;
  const pickedSub = subs.find((s) => s.slug === subSlug);
  const privateSpace = pickedCommunity?.privacy === "private" || !!pickedSub;

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
      if (groupsOnly && !subSlug) {
        setErrors({ subSlug: "Pick the group this event is for." });
        setFormError("Pick the group this event is for.");
        setBusy(false);
        return;
      }
      const res = await EventService.create(input);
      router.push(`/events/${res.data.id}`);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  if (status === "loading" || (status === "authed" && hosting.loading)) return <p className="text-sm text-ink-muted">Loading…</p>;

  // Everyone but site admins posts from a community they run, reached from its Events page.
  if (hosting.data && !siteAdmin && !own) {
    return (
      <div className="max-w-xl space-y-4 rounded-card border border-line bg-surface p-6">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-raised text-accent-text">
          <Icon name="calendar" size={20} />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Events are posted from inside a community</h2>
        <p className="text-sm text-ink-muted">
          A community&apos;s owner and admins post its events from the community&apos;s Events page, and a group&apos;s owner and admins can post in their group. {communities.length ? "Pick one you run:" : "Start a community, or ask the admins of one you're in to post your event."}
        </p>
        {communities.length > 0 ? (
          <ul className="space-y-1.5">
            {communities.map((c) => (
              <li key={c.slug}>
                <Link href={`/communities/${c.slug}?view=events`} className="flex items-center gap-2 rounded-control border border-line px-3 py-2.5 text-sm font-semibold transition hover:bg-raised">
                  <Icon name="calendar" size={15} className="text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.groupsOnly && <span className="text-xs font-normal text-ink-muted">your groups</span>}
                  <Icon name="chevron-right" size={14} className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button href="/communities/new" variant="primary">Start a community</Button>
            <Button href="/events">Browse events</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5" noValidate>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.eventTitle} error={errors.title} placeholder="Sunday sunset skate" />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.eventDescription} counter={LIMITS.eventDescription} error={errors.description} hint="What should people expect? What should they bring?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Interest" value={interest} onChange={(e) => isInterestId(e.target.value) && setInterest(e.target.value)} error={errors.interest}>
          {categories.map((i) => (
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

      <fieldset className="space-y-4 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-[13px] font-medium">Where it&apos;s posted</legend>
        {siteAdmin ? (
          <AdminCommunityPicker
            officialName="Klique"
            value={communitySlug}
            name={pickedCommunity?.name ?? null}
            onChange={(slug) => {
              setCommunitySlug(slug);
              setSubSlug("");
            }}
            error={errors.communitySlug}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <Icon name="users" size={15} className="text-ink-muted" />
            <span className="font-semibold">{pickedCommunity?.name}</span>
          </p>
        )}
        {communitySlug && subs.length > 0 && (
          <SelectField label="Group" value={subSlug} onChange={(e) => setSubSlug(e.target.value)} error={errors.subSlug}>
            {groupsOnly ? <option value="">Pick a group you run</option> : <option value="">Whole community</option>}
            {subs.map((g) => (
              <option key={g.id} value={g.slug}>
                {g.name}
              </option>
            ))}
          </SelectField>
        )}
        {privateSpace ? (
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            {pickedSub ? "Groups are private, so the event is for the group's members only." : "This community is private, so the event will be members-only."}
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            {!communitySlug || communitySlug === KLIQUE_SLUG
              ? "Goes into Klique, the community everyone's in: everyone sees it on the homepage and the Events page."
              : "For this community's members: they see it in their feeds. Visitors to the community's page can see it too, and join to go."}
          </p>
        )}
      </fieldset>

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
      <PageTitle title="New event" eyebrow="Post an event">
        Tell people where to be and when.
      </PageTitle>
      <Suspense fallback={null}>
        <NewEventForm />
      </Suspense>
    </div>
  );
}

/** Site admins: post in any community (search by name), or leave it to Klique (everyone sees it). */
function AdminCommunityPicker({ value, name, officialName, onChange, error }: { value: string; name: string | null; officialName: string; onChange: (slug: string) => void; error?: string }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const results = useApi(dq ? () => AdminService.communities({ q: dq, sort: "members" }) : null, [dq]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon name={value ? "users" : "globe"} size={15} className="text-ink-muted" />
        <span className="font-semibold">{value ? (name ?? value) : `${officialName} (official)`}</span>
        {value && (
          <button type="button" onClick={() => onChange("")} className="ml-auto text-xs font-semibold text-accent-text hover:underline">
            Post in {officialName} instead
          </button>
        )}
      </div>
      <TextField label="Or post in another community" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities by name" error={error} />
      {dq && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {results.loading ? (
            <li className="px-1 text-xs text-ink-muted">Searching…</li>
          ) : (results.data?.items ?? []).length === 0 ? (
            <li className="px-1 text-xs text-ink-muted">No communities match.</li>
          ) : (
            results.data!.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.slug);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm transition hover:bg-raised"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                  <span className="font-mono text-[11px] text-ink-muted">{c.memberCount} members</span>
                  {c.privacy === "private" && <Icon name="lock" size={12} className="text-ink-muted" />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
