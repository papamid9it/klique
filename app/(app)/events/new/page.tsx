"use client";

import { ContributionFields, contributionDraftOf, contributionInput, type ContributionDraft } from "@/components/domain/money/Contribute";
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
import { CURRENCIES, formatDateShort, eventPrice } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import { isHttpLink, normalizeLink } from "@/lib/links";
import { wallToIso } from "@/lib/timezones";
import { usePlaceZone, ZoneField } from "@/components/domain/places/ZoneField";

/** a date and time typed in the event's zone, as an instant */
function toIso(date: string, time: string, zone: string): string | null {
  if (!date || !time) return null;
  return wallToIso(date, time, zone);
}

/** Which step asks for each field, so an error about one goes back to that step (as in the app: three short steps) */
const STEP1 = ["title", "description", "interest", "date", "startsAt", "endsAt", "coverImage"];
const STEP2 = ["city", "country", "region", "neighborhood", "venue", "onlineUrl", "priceNaira", "capacity", "ticketUrl", "ticketLabel"];
const stepOf = (errs: Record<string, string>): 1 | 2 | null => (STEP1.some((k) => errs[k]) ? 1 : STEP2.some((k) => errs[k]) ? 2 : null);
const STEP_NAMES = { 1: "What and when", 2: "Where and price", 3: "Check and post" } as const;

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
  const [ticketUrl, setTicketUrl] = useState("");
  const [ticketLabel, setTicketLabel] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // an event over several days: the day it ends (empty: the same day it starts)
  const [endDate, setEndDate] = useState("");
  // the price, as a choice: free, paid (then an amount), or not known yet ("Price TBC")
  const [priceMode, setPriceMode] = useState<"free" | "paid" | "tbc">("free");
  const [price, setPrice] = useState("");
  // ticket link and button: folded away until wanted
  const [tickets, setTickets] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [cover, setCover] = useState("");
  const [chipIn, setChipIn] = useState<ContributionDraft>(() => contributionDraftOf(null));
  const [communitySlug, setCommunitySlug] = useState(params.get("community") ?? "");
  const [subSlug, setSubSlug] = useState(params.get("sub") ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // what and when, then where and price, then check and post
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (status === "anon") requireAuth({ redirect: true });
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
  // a member's community: the event waits for its owner or an admin to approve it
  const submitting = !!own?.submit && !siteAdmin;
  const pickedSub = subs.find((s) => s.slug === subSlug);
  const privateSpace = pickedCommunity?.privacy === "private" || !!pickedSub;

  const priceNum = priceMode === "free" ? 0 : priceMode === "tbc" ? null : Math.max(0, Math.round(Number(price) || 0));
  const cur = currency ?? currencyOf(place.country);
  // the times are typed in the place's zone (Lagos for Nigeria)
  const { zone, choices: zoneChoices, setZone } = usePlaceZone(place);

  /** What a step needs before moving on (step 2 checks step 1's too). */
  function problems(upTo: 1 | 2) {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your event a name.";
    if (!date) next.date = "Pick a date.";
    if (!start) next.startsAt = "Pick a start time.";
    const from = toIso(date, start, zone);
    const to = endIso();
    if (to && from && to <= from) next.endsAt = endDate && endDate !== date ? "The end has to be after the start." : "End time must be after the start.";
    if (upTo === 1) return next;
    if (!venue.trim()) next.venue = online ? "Where do people join? A link or a platform name." : "Where is it happening?";
    if (!place.city) next.city = "Which city or town is it in?";
    const joinLink = online ? normalizeLink(onlineUrl) : "";
    if (joinLink && !isHttpLink(joinLink)) next.onlineUrl = "Enter a valid link, like https://meet.google.com/abc-defg-hij";
    if (priceMode === "paid" && !(Number(price) > 0)) next.priceNaira = "Add the price, or pick Free or Not sure yet.";
    const tix = normalizeLink(ticketUrl);
    if (tix && !isHttpLink(tix)) next.ticketUrl = "Enter a valid link, like https://tix.africa/your-event";
    const cap = capacity.trim() ? Math.round(Number(capacity)) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap < 1)) next.capacity = "Capacity must be 1 or more.";
    return next;
  }

  /** when it ends: the end time on the end day (or the start day); a later end day alone means the end of that day */
  function endIso(): string | null {
    const day = endDate || date;
    if (end) return toIso(day, end, zone);
    if (endDate && endDate !== date) return toIso(endDate, "23:59", zone);
    return null;
  }

  function goNext() {
    const now = step === 1 ? 1 : 2;
    const next = problems(now);
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return setStep(stepOf(next) ?? now);
    setStep(now === 1 ? 2 : 3);
    window.scrollTo({ top: 0 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 3) return goNext();
    if (!requireAuth()) return;
    const next: Record<string, string> = problems(2);
    const startsAt = toIso(date, start, zone);
    const endsAt = endIso();
    const tickets = normalizeLink(ticketUrl);
    const joinLink = online ? normalizeLink(onlineUrl) : "";
    const cap = capacity.trim() ? Math.round(Number(capacity)) : null;
    if (Object.keys(next).length || !startsAt) {
      setErrors(next);
      setFormError(null);
      setStep(stepOf(next) ?? 1);
      return;
    }
    const input: EventInput = {
      title: title.trim(),
      description: description.trim(),
      interest,
      ...place,
      neighborhood,
      online,
      ticketUrl: tickets || null,
      ticketLabel: ticketLabel.trim(),
      onlineUrl: joinLink || null,
      currency: cur,
      venue: venue.trim(),
      startsAt,
      endsAt,
      timeZone: zone,
      priceNaira: priceNum,
      capacity: cap,
      coverImage: cover.trim() || null,
      communitySlug: communitySlug || undefined,
      subSlug: communitySlug && subSlug ? subSlug : undefined,
      contribution: null as ReturnType<typeof contributionInput>,
    };
    try {
      input.contribution = communitySlug && communitySlug !== KLIQUE_SLUG ? contributionInput(chipIn) : null;
    } catch (err) {
      setErrors({ contribution: (err as Error).message });
      return;
    }
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
      if (isApiError(err) && err.errors) {
        setErrors(err.errors);
        // something on the first page: take them back to it
        const back = stepOf(err.errors);
        if (back) setStep(back);
      }
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
          A community&apos;s owner and admins post its events from the community&apos;s Events page, and a group&apos;s owner and admins can post in their group. Members can send one in for approval. {communities.length ? "Pick a community:" : "Start a community, or join one to send your event in."}
        </p>
        {communities.length > 0 ? (
          <ul className="space-y-1.5">
            {communities.map((c) => (
              <li key={c.slug}>
                <Link href={`/communities/${c.slug}?view=events`} className="flex items-center gap-2 rounded-control border border-line px-3 py-2.5 text-sm font-semibold transition hover:bg-raised">
                  <Icon name="calendar" size={15} className="text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.groupsOnly && <span className="text-xs font-normal text-ink-muted">your groups</span>}
                  {c.submit && <span className="text-xs font-normal text-ink-muted">needs approval</span>}
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
      {/* where you are: a bar for each step */}
      <div className="space-y-2">
        <div className="flex gap-1.5" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-ink" : "bg-raised"}`} />)}</div>
        <p className="text-sm font-medium text-ink-muted">Step {step} of 3 · {STEP_NAMES[step]}</p>
      </div>
      {step === 1 ? (
      <>
      <ImageField kind="photo" label="Flyer or cover picture (optional)" value={cover} onChange={setCover} reposition={{ aspect: 16 / 9, title: "Choose what shows on event cards", description: "The event page shows your whole flyer. Lists and Home show a wide strip of it: drag to pick which part, and pinch, scroll or use the slider to zoom." }} error={errors.coverImage} hint="Your flyer or poster, any shape: the event page shows all of it. Event cards show a wide strip; use Reposition to pick which part. We'll use artwork if you skip it." />
      <TextField label="Event name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.eventTitle} error={errors.title} placeholder="Sunday sunset skate" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Starts on" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextField label="Starts at" type="time" value={start} onChange={(e) => setStart(e.target.value)} error={errors.startsAt} />
        <TextField label="Ends on (optional)" type="date" min={date || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} hint="Only for an event over more than one day." />
        <TextField label="Ends at (optional)" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.endsAt} />
      </div>
      <ZoneField zone={zone} choices={zoneChoices} onChange={setZone} />
      <TextArea label="What's it about? (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.eventDescription} counter={LIMITS.eventDescription} error={errors.description} hint="Who it's for, what to bring, anything people should know." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Interest" value={interest} onChange={(e) => isInterestId(e.target.value) && setInterest(e.target.value)} error={errors.interest}>
          {categories.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </SelectField>
      </div>
      </>
      ) : step === 2 ? (
      <>
      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-raised p-3.5 has-[:checked]:border-accent-text">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="mt-1 accent-[var(--accent-text)]" />
        <span>
          <span className="block text-sm font-semibold">This is an online event</span>
          <span className="block text-xs text-ink-muted">It still shows under your city, but is marked Online and can be filtered.</span>
        </span>
      </label>
      <PlaceFields value={place} onChange={setPlace} neighborhood={neighborhood} onNeighborhood={setNeighborhood} errors={errors} />
      <TextField label={online ? "Where to join" : "Venue"} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={LIMITS.venue} error={errors.venue} placeholder={online ? "Zoom, Google Meet, a Discord server…" : "Name of the spot"} />
      {online && <TextField label="Join link (optional)" type="url" inputMode="url" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} onBlur={() => setOnlineUrl((v) => normalizeLink(v))} error={errors.onlineUrl} placeholder="https://meet.google.com/…" hint="Shows as a Join online button on the event." />}
      {/* the price, as one choice */}
      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-[13px] font-medium">Price</legend>
        <div role="radiogroup" aria-label="Price" className="grid grid-cols-3 gap-1 rounded-control bg-raised p-1">
          {([["free", "Free"], ["paid", "Paid"], ["tbc", "Not sure yet"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={priceMode === id} onClick={() => setPriceMode(id)} className={`h-9 rounded-[6px] text-sm font-semibold transition ${priceMode === id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        {priceMode === "paid" && (
          <div className="grid grid-cols-[6.5rem_1fr] gap-3">
            <SelectField label="Currency" value={cur} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currencyOf(place.country), ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </SelectField>
            <TextField label="Price" type="number" inputMode="numeric" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} error={errors.priceNaira} placeholder="5000" />
          </div>
        )}
        {priceMode === "tbc" && <p className="text-sm text-ink-muted">It shows &ldquo;Price TBC&rdquo; until you add one.</p>}
        {priceMode !== "paid" && errors.priceNaira && <p className="text-sm text-danger">{errors.priceNaira}</p>}
      </fieldset>
      <TextField label="Capacity (optional)" type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} hint="Leave empty for unlimited spots." />
      {tickets || ticketUrl ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Ticket link" type="url" inputMode="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} onBlur={() => setTicketUrl((v) => normalizeLink(v))} error={errors.ticketUrl} placeholder="https://tix.africa/…" hint="Shows as a button on the event." />
          <TextField label="Button name (optional)" value={ticketLabel} onChange={(e) => setTicketLabel(e.target.value)} maxLength={LIMITS.ticketLabel} error={errors.ticketLabel} placeholder="Get tickets" />
        </div>
      ) : (
        <button type="button" onClick={() => setTickets(true)} className="flex w-full items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-3 text-left hover:bg-raised">
          <Icon name="ticket" size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Selling tickets somewhere?</span>
            <span className="block text-[13px] text-ink-muted">Add the link, and a button shows on the event</span>
          </span>
          <Icon name="plus" size={16} />
        </button>
      )}
      {communitySlug && communitySlug !== KLIQUE_SLUG && <ContributionFields value={chipIn} onChange={setChipIn} error={errors.contribution} />}
      </>
      ) : (
      <>
      <section aria-label="Preview" className="overflow-hidden rounded-card border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover.trim() ? <img src={cover.trim()} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="flex aspect-[16/9] w-full items-center justify-center bg-raised text-ink-muted"><Icon name="calendar" size={30} /></div>}
        <div className="space-y-1 p-4">
          <p className="eyebrow">{online ? "Online" : place.city || "Event"} · {toIso(date, start, zone) ? formatDateShort(toIso(date, start, zone)!, zone) : ""}</p>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">{title.trim()}</h2>
          <p className="text-sm text-ink-muted">{venue.trim()}{neighborhood ? ` · ${neighborhood}` : ""}</p>
          <p className="text-sm font-semibold">{eventPrice(priceNum, cur)}</p>
          {description.trim() && <p className="line-clamp-3 pt-1 text-sm whitespace-pre-wrap text-ink-muted">{description.trim()}</p>}
        </div>
      </section>
      <fieldset className="space-y-4 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 text-[13px] font-medium">Where it&apos;s posted</legend>
        {siteAdmin ? (
          <AdminCommunityPicker
            officialName="Klique HQ"
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
        {submitting && (
          <p className="flex items-start gap-2 rounded-control bg-raised px-3 py-2.5 text-[13px] text-ink-muted">
            <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-accent-text" />
            <span>
              It goes to {pickedCommunity?.name}&apos;s owner and admins first. Once one of them approves it, it&apos;s posted and members hear about it. You&apos;ll get a notification either way.
            </span>
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
      </>
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
        {step !== 3 ? (
          <>
            <Button key="next" type="submit" variant="primary" size="lg">
              Next <Icon name="chevron-right" size={16} />
            </Button>
            {step === 1 ? (
              <Button size="lg" href="/events">
                Cancel
              </Button>
            ) : (
              <Button size="lg" onClick={() => setStep(1)}>
                <Icon name="chevron-left" size={16} /> Back
              </Button>
            )}
          </>
        ) : (
          <>
            <Button key="publish" type="submit" variant="primary" size="lg" loading={busy} disabled={status !== "authed"}>
              {submitting ? "Send for approval" : "Post event"}
            </Button>
            <Button size="lg" disabled={busy} onClick={() => setStep(2)}>
              <Icon name="chevron-left" size={16} /> Back
            </Button>
          </>
        )}
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
                  <span className="font-mono text-[12px] text-ink-muted">{c.memberCount} members</span>
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
