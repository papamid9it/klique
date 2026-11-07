"use client";

import { useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { useCategories } from "@/lib/hooks/useCategories";
import type { CrewDTO, CrewJoinMode, EventDTO } from "@/lib/types";
import { fromLagos, lagosInputs } from "./parts";
import { AudienceFields, audienceInput, checkAudience, type AudienceValue } from "./AudienceFields";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { DEFAULT_COUNTRY, type Place } from "@/lib/places";
import { useAuth } from "@/components/providers/AuthProvider";

type EventBits = Pick<EventDTO, "id" | "title" | "startsAt" | "neighborhood" | "interest" | "coverImage">;
type CommunityBits = { slug: string; name: string; interest: string };
/** the "All communities" choice: no community, open to anyone in a place */
const ALL = "__all";

/**
 * Start a klique: for an event (going together), or for a community (anything its members want to do; pick
 * which, unless it's given). A cover picture and a hook line are what make people tap, so both are required.
 * Starts out "Ask to join", 10 people; for an event, meeting an hour before it.
 */
export function StartCrewModal({ event, community, open, onClose, onCreated }: { event?: EventBits; community?: CommunityBits; open: boolean; onClose: () => void; onCreated: (c: CrewDTO) => void }) {
  const categories = useCategories();
  const info = useApi(open ? () => CrewService.startInfo() : null, [open], { key: "klique-start" });
  const [start] = useState(() =>
    lagosInputs(new Date(event ? Math.max(Date.now() + 30 * 60_000, new Date(event.startsAt).getTime() - 3600_000) : Date.now() + 2 * 86_400_000).toISOString()),
  );
  const [communitySlug, setCommunitySlug] = useState(community?.slug ?? "");
  const [title, setTitle] = useState("");
  const { user } = useAuth();
  // your profile picture to start with (change it to anything); without one it starts empty and a picture is required
  // no stand-in picture: a klique needs a photo of its own
  const [coverImage, setCoverImage] = useState("");
  const [place, setPlace] = useState<Place>({ country: user?.country || DEFAULT_COUNTRY, region: user?.region ?? "", city: user?.city ?? "" });
  const [interest, setInterest] = useState(event?.interest ?? community?.interest ?? "");
  const [area, setArea] = useState("");
  const [meetupPoint, setMeetupPoint] = useState("");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(event ? start.time : "18:00");
  const [note, setNote] = useState("");
  const [joinMode, setJoinMode] = useState<CrewJoinMode>("approval");
  const [who, setWho] = useState<AudienceValue>({ spots: "9", audience: "everyone", womenSpots: "0", menSpots: "0" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const choices = info.data?.communities ?? [];
  const blocked = info.data?.blockedReason ?? null;
  const pickCommunity = (slug: string) => {
    setCommunitySlug(slug);
    const c = choices.find((x) => x.slug === slug);
    if (c && !interest) setInterest(c.interest);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!event && !communitySlug) next.community = "Pick a community, or All communities.";
    if (communitySlug === ALL && !place.city.trim()) next.city = "Which city is it in?";
    if (title.trim().length < 8) next.title = "Say what you're doing, e.g. “Who wants to watch Dune at Filmhouse Lekki on Saturday?”";
    if (!coverImage) next.coverImage = "Add a cover picture. Kliques with a picture get far more people.";
    if (!event && !interest) next.interest = "Pick what it's about.";
    if (area.trim().length < 2) next.area = "Which area? A neighbourhood or landmark.";
    if (meetupPoint.trim().length < 2) next.meetupPoint = "Where should everyone meet?";
    if (!date || !time) next.meetupAt = "Pick a date and time.";
    Object.assign(next, checkAudience(who));
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    const input = { title: title.trim(), interest, coverImage, area: area.trim(), meetupPoint: meetupPoint.trim(), meetupAt: fromLagos(date, time), note: note.trim(), joinMode, ...audienceInput(who) };
    try {
      const res = event ? await CrewService.create(event.id, input) : communitySlug === ALL ? await CrewService.createInCommunity(null, { ...input, country: place.country, city: place.city }) : await CrewService.createInCommunity(communitySlug, input);
      onCreated(res.data);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a klique" description={event ? `Find people to go to ${event.title} with.` : "Get people together to do something: a movie, a match, a run, a night out."}>
      {blocked ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-control border border-line bg-raised p-3.5 text-sm">
            <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
            {blocked}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Close</Button>
            {/plan|upgrade/i.test(blocked) && (
              <Button variant="primary" href="/settings?tab=plan">
                See plans
              </Button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!event && !community && (
            <SelectField label="Community" value={communitySlug} onChange={(e) => pickCommunity(e.target.value)} error={errors.community} hint={communitySlug === ALL ? "Anyone can see and join it. It's recommended to people into what it's about." : "Only its members can see and join it. Going to an event? Start one from the event's page instead."}>
              <option value="">Pick one…</option>
              <option value={ALL}>All communities</option>
              {choices.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
          {!event && !community && communitySlug === ALL && <PlaceFields value={place} onChange={setPlace} errors={errors} />}
          <ImageField kind="photo" label="Cover picture" value={coverImage} onChange={setCoverImage} error={errors.coverImage} required hint="Required. The place, the movie poster, the vibe. No explicit pictures." reposition={{ aspect: 4 / 5 }} />
          <TextField label="What's the plan?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={event ? `Who's going to ${event.title} from Yaba?` : "Who wants to watch a movie at the cinema on Saturday?"} error={errors.title} hint="Write it like a question to your friends." />
          {!event && (
            <SelectField label="What it's about" value={interest} onChange={(e) => setInterest(e.target.value)} error={errors.interest} hint="People into this see it first.">
              <option value="">Pick one…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.meetupAt} />
            <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="Lagos time (WAT)" />
          </div>
          <TextField label="Area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} placeholder="e.g. Lekki Phase 1" error={errors.area} hint="Everyone sees this." />
          <TextField label="Meetup point" value={meetupPoint} onChange={(e) => setMeetupPoint(e.target.value)} maxLength={120} placeholder="e.g. Filmhouse Lekki, by the ticket desk" error={errors.meetupPoint} hint="Only people in the klique see the exact spot." />
          <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} counter={300} placeholder="e.g. Buying tickets at 6. Food after if people are up for it." />

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-[13px] font-medium">Who can join</legend>
            {(
              [
                ["approval", "Ask to join", "You accept each person first. Safer with people you don't know."],
                ["open", "Open", "Anyone who can see it joins straight away."],
              ] as const
            ).map(([id, label, hint]) => (
              <label key={id} className={cx("flex cursor-pointer items-start gap-3 rounded-control border bg-raised p-3 transition", joinMode === id ? "border-accent-text" : "border-line")}>
                <input type="radio" name="klique-join" checked={joinMode === id} onChange={() => setJoinMode(id)} className="mt-1 accent-[var(--accent-text)]" />
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <AudienceFields value={who} onChange={setWho} canWomen={!!info.data?.canWomenOnly} canMen={!!info.data?.canMenOnly} errors={errors} />

          <div className="space-y-1.5 rounded-control border border-line bg-raised p-3 text-xs text-ink-muted">
            <p className="flex items-start gap-2">
              <Icon name="shield" size={14} className="mt-0.5 shrink-0" /> Meet in a public place, and tell someone where you&apos;re going.
            </p>
            <p className="flex items-start gap-2">
              <Icon name="clock" size={14} className="mt-0.5 shrink-0" /> The klique and its chat disappear a day after it happens.
            </p>
          </div>
          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Start klique
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
