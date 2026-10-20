"use client";

import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { EventService } from "@/app/services/EventService";
import { DateChip, PriceTag } from "@/components/domain/EventCard";
import { PersonRow } from "@/components/domain/PersonRow";
import { ReportDialog } from "@/components/domain/ReportDialog";
import { ShareButton } from "@/components/domain/ShareButton";
import { ReminderPrompt } from "@/components/domain/events/ReminderPrompt";
import { SponsoredBox, useAds } from "@/components/domain/ads/Sponsored";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ImageField } from "@/components/ui/ImageField";
import { Button } from "@/components/ui/Button";
import { eventPhoto } from "@/lib/fake";
import { Cover } from "@/components/ui/Cover";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { InterestChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { INTERESTS, LIMITS, isInterestId, type InterestId } from "@/lib/constants";
import { currencyOf, placeLabel, type Place } from "@/lib/places";
import { CURRENCIES, formatDateLong, formatDateShort, formatPrice, formatTime } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { useEventActions } from "@/lib/hooks/useEventActions";
import type { EventDTO } from "@/lib/types";

/** Lagos (UTC+1) wall-clock parts for form inputs. */
function lagosInputs(iso: string) {
  const d = new Date(new Date(iso).getTime() + 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`).toISOString();

function EditModal({ event, open, onClose, onSaved }: { event: EventDTO; open: boolean; onClose: () => void; onSaved: (e: EventDTO) => void }) {
  const toast = useToast();
  const s = lagosInputs(event.startsAt);
  const en = event.endsAt ? lagosInputs(event.endsAt) : null;
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [interest, setInterest] = useState<InterestId>(event.interest);
  const [place, setPlace] = useState<Place>({ country: event.country, region: event.region, city: event.city });
  const [online, setOnline] = useState(event.online);
  const [currency, setCurrency] = useState(event.currency);
  const [neighborhood, setNeighborhood] = useState(event.neighborhood);
  const [venue, setVenue] = useState(event.venue);
  const [date, setDate] = useState(s.date);
  const [start, setStart] = useState(s.time);
  const [end, setEnd] = useState(en?.time ?? "");
  const [price, setPrice] = useState(String(event.priceNaira));
  const [capacity, setCapacity] = useState(event.capacity ? String(event.capacity) : "");
  const [cover, setCover] = useState(event.coverImage ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !venue.trim() || !date || !start) {
      setErrors({
        ...(title.trim() ? {} : { title: "Title is required." }),
        ...(venue.trim() ? {} : { venue: "Venue is required." }),
        ...(date ? {} : { date: "Pick a date." }),
        ...(start ? {} : { startsAt: "Pick a start time." }),
      });
      return;
    }
    const cap = capacity.trim() ? Math.round(Number(capacity)) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap < 1)) {
      setErrors({ capacity: "Capacity must be 1 or more." });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await EventService.update(event.id, {
        title: title.trim(),
        description: description.trim(),
        interest,
        ...place,
        neighborhood,
        online,
        currency,
        venue: venue.trim(),
        startsAt: toIso(date, start),
        endsAt: end ? toIso(date, end) : null,
        priceNaira: Math.max(0, Math.round(Number(price) || 0)),
        capacity: cap,
        coverImage: cover.trim() || null,
      });
      onSaved(res.data);
      toast("Event updated", "success");
      onClose();
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit event" size="lg">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.eventTitle} error={errors.title} />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.eventDescription} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Interest" value={interest} onChange={(e) => isInterestId(e.target.value) && setInterest(e.target.value)} error={errors.interest}>
            {INTERESTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="accent-[var(--accent-text)]" /> Online event
        </label>
        <PlaceFields value={place} onChange={setPlace} neighborhood={neighborhood} onNeighborhood={setNeighborhood} errors={errors} />
        <TextField label={online ? "Where to join" : "Venue"} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={LIMITS.venue} error={errors.venue} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <TextField label="Starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} error={errors.startsAt} />
          <TextField label="Ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.endsAt} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[6.5rem_1fr] gap-3">
            <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, currencyOf(place.country), ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </SelectField>
            <TextField label="Price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} error={errors.priceNaira} hint={`Shown as: ${formatPrice(Number(price) || 0, currency)}`} />
          </div>
          <TextField label="Capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} hint="Empty = unlimited" />
        </div>
        <ImageField kind="photo" label="Cover image" value={cover} onChange={setCover} error={errors.coverImage} />
        {formError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HostMenu({ event, onEdit, onCancel, onDelete }: { event: EventDTO; onEdit: () => void; onCancel: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised";
  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="more" /> Manage
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-xl">
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
            <Icon name="edit" size={15} /> Edit event
          </button>
          {!event.isPast && (
            <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onCancel(); }}>
              <Icon name="ban" size={15} /> Cancel event
            </button>
          )}
          <button role="menuitem" type="button" className={`${item} text-danger`} onClick={() => { setOpen(false); onDelete(); }}>
            <Icon name="trash" size={15} /> Delete event
          </button>
        </div>
      )}
    </div>
  );
}

function EventView({ event, onChange }: { event: EventDTO; onChange: (e: EventDTO) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { busy, rsvp, toggleSave } = useEventActions(event, onChange);
  const attendees = useApi(() => EventService.attendees(event.id), [event.id, event.goingCount, event.interestedCount], { key: `attendees:${event.id}` });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [working, setWorking] = useState(false);

  const going = event.viewer.rsvp === "going";
  const [partnerAd] = useAds("event-page", { interest: event.interest, exclude: event.id });
  const isHost = event.viewer.isHost;
  const cancelled = (event as EventDTO & { cancelled?: boolean }).cancelled === true;
  const spots = event.capacity ? `${event.goingCount} of ${event.capacity} spots` : `${event.goingCount} going`;

  async function setCancelled() {
    setWorking(true);
    try {
      const res = await EventService.update(event.id, { cancelled: true });
      onChange(res.data);
      toast("Event cancelled", "success");
      setCancelling(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setWorking(false);
    }
  }
  async function remove() {
    setWorking(true);
    try {
      await EventService.remove(event.id);
      toast("Event deleted", "success");
      router.push("/events");
    } catch (e) {
      toast(errorMessage(e), "error");
      setWorking(false);
    }
  }

  const people = attendees.data?.people ?? [];

  return (
    <article>
      <Link href="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <Icon name="arrow-left" size={15} /> All events
      </Link>
      <Cover src={eventPhoto(event.id, event.coverImage)} seed={event.id} interest={event.interest} className="aspect-[16/8] w-full rounded-card border border-line">
        <div className="absolute top-4 left-4">
          <DateChip iso={event.startsAt} />
        </div>
        <div className="absolute top-4 right-4">
          <PriceTag amount={event.priceNaira} currency={event.currency} />
        </div>
      </Cover>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <header>
            <div className="mb-3 flex flex-wrap gap-2">
              <InterestChip id={event.interest} />
              {cancelled && <span className="chip chip-ink text-danger">Cancelled</span>}
              {event.isPast && <span className="chip chip-ink">Past event</span>}
            </div>
            <h1 className="display text-[clamp(1.75rem,4vw,2.5rem)] text-balance">{event.title}</h1>
          </header>

          <dl className="space-y-3 text-[15px]">
            <div className="flex gap-3">
              <dt className="mt-0.5 text-ink-muted"><Icon name="clock" /><span className="sr-only">When</span></dt>
              <dd>
                <span className="font-medium">{formatDateLong(event.startsAt)}</span>
                <span className="block text-ink-muted">
                  {formatTime(event.startsAt)}
                  {event.endsAt ? ` – ${formatTime(event.endsAt)}` : ""}
                </span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="mt-0.5 text-ink-muted"><Icon name="pin" /><span className="sr-only">Where</span></dt>
              <dd>
                <span className="font-medium">{event.venue}</span>
                <span className="block text-ink-muted">
                  {[event.neighborhood, placeLabel(event)].filter(Boolean).join(", ")}
                </span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="mt-0.5 text-ink-muted"><Icon name="ticket" /><span className="sr-only">Price</span></dt>
              <dd className="font-medium">{formatPrice(event.priceNaira, event.currency)}</dd>
            </div>
          </dl>

          {(event.community || event.subcommunity) && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <Icon name={event.community?.privacy === "private" ? "lock" : "users"} size={15} />
              {event.community && (
                <Link href={`/communities/${event.community.slug}`} className="font-medium text-accent-text hover:underline">
                  {event.community.name}
                </Link>
              )}
              {event.community && event.subcommunity && <span aria-hidden="true">/</span>}
              {event.subcommunity && event.community && (
                <Link href={`/communities/${event.community.slug}/groups/${event.subcommunity.slug}`} className="font-medium text-accent-text hover:underline">
                  {event.subcommunity.name}
                </Link>
              )}
              {event.audience !== "public" && <span>· Members only</span>}
            </p>
          )}

          {event.description && (
            <section aria-label="About this event">
              <h2 className="mb-2 text-base font-semibold">About</h2>
              <p className="leading-relaxed whitespace-pre-line text-ink">{event.description}</p>
            </section>
          )}

          <section className="kq-calm" aria-label="Hosted by">
            <h2 className="mb-2 text-base font-semibold">Hosted by</h2>
            <PersonRow user={event.host} />
          </section>

          <section aria-label="Who's going" className="kq-calm">
            <h2 className="mb-2 text-base font-semibold">{spots}</h2>
            {attendees.loading ? (
              <Skeleton className="h-10 w-48" />
            ) : (
              <>
                {people.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {people.map((p) => (
                      <li key={p.id}>
                        <ProfileTrigger handle={p.handle} title={p.displayName} className="block rounded-full ring-2 ring-surface transition hover:ring-accent text-left">
                          <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={40} />
                          <span className="sr-only">{p.displayName}</span>
                        </ProfileTrigger>
                      </li>
                    ))}
                  </ul>
                )}
                {attendees.data?.namesHidden && <p className="mt-2 text-sm text-ink-muted">Some people keep attendance private.</p>}
                {!attendees.data?.namesHidden && people.length === 0 && !attendees.error && <p className="text-sm text-ink-muted">Nobody yet. Be the first.</p>}
              </>
            )}
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-3 rounded-card border border-line bg-surface p-4">
            {isHost ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="check" className="text-accent-text" /> You&apos;re hosting
                </p>
                {event.audience === "public" && !event.isPast && !cancelled && (
                  <Button href={`/events/${event.id}/promote`} variant="secondary" className="w-full">
                    <Icon name="megaphone" size={15} /> Promote this event
                  </Button>
                )}
              </>
            ) : cancelled ? (
              <p className="text-sm font-medium text-danger">This event was cancelled.</p>
            ) : event.isPast ? (
              <p className="text-sm text-ink-muted">This event has ended.</p>
            ) : (
              <>
                {event.isFull && !going && <p className="text-sm font-medium text-ink-muted">This event is full.</p>}
                <Button
                  variant={going ? "primary" : "secondary"}
                  size="lg"
                  className="w-full"
                  onClick={() => rsvp("going")}
                  loading={busy === "rsvp"}
                  disabled={event.isFull && !going}
                  aria-pressed={going}
                >
                  {going ? (
                    <>
                      <Icon name="check" /> You&apos;re going
                    </>
                  ) : (
                    "I'm going"
                  )}
                </Button>
                {going && <ReminderPrompt />}
                {event.viewer.rsvp && (
                  <button type="button" onClick={() => rsvp(event.viewer.rsvp!)} className="w-full text-center text-xs text-ink-muted underline hover:text-ink" disabled={busy === "rsvp"}>
                    Cancel my RSVP
                  </button>
                )}
              </>
            )}
            <Button className="w-full" onClick={toggleSave} loading={busy === "save"} aria-pressed={event.viewer.saved}>
              <Icon name="bookmark" /> {event.viewer.saved ? "Saved" : "Save for later"}
            </Button>
          </div>
          {!event.isPast && !event.viewer.isHost && partnerAd && <SponsoredBox ad={partnerAd} image={false} />}
          <div className="flex flex-wrap gap-2">
            <ShareButton path={`/events/${event.id}`} text={`${event.title} — ${formatDateShort(event.startsAt)}`} />
            {event.viewer.canEdit || isHost ? (
              <HostMenu event={event} onEdit={() => setEditing(true)} onCancel={() => setCancelling(true)} onDelete={() => setDeleting(true)} />
            ) : (
              <Button variant="ghost" onClick={() => setReporting(true)}>
                <Icon name="flag" /> Report
              </Button>
            )}
          </div>
        </aside>
      </div>

      {editing && <EditModal event={event} open={editing} onClose={() => setEditing(false)} onSaved={onChange} />}
      <Modal open={cancelling} onClose={() => setCancelling(false)} title="Cancel this event?" description="Attendees will see it as cancelled. You can't undo this." size="sm">
        <div className="flex justify-end gap-2">
          <Button onClick={() => setCancelling(false)}>Keep event</Button>
          <Button variant="danger" loading={working} onClick={setCancelled}>
            Cancel event
          </Button>
        </div>
      </Modal>
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete this event?" description="This permanently removes the event and all RSVPs." size="sm">
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleting(false)}>Keep event</Button>
          <Button variant="danger" loading={working} onClick={remove}>
            Delete
          </Button>
        </div>
      </Modal>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="event" targetId={event.id} subject="this event" />
    </article>
  );
}

export function EventPageView() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, status, reload, setData } = useApi(() => EventService.get(id), [id], { key: `event:${id}` });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-[16/8] w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (status === 404 || status === 403 || status === 400) {
    return (
      <EmptyState icon="lock" title="Event not found" action={<Button href="/events">Browse events</Button>}>
        This event doesn&apos;t exist, or it&apos;s members-only.
      </EmptyState>
    );
  }
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  return <EventView event={data} onChange={(e) => setData(e)} />;
}
