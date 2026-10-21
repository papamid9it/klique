"use client";

import { useState } from "react";
import { errorMessage, isApiError } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import type { CrewDTO, CrewJoinMode, EventDTO } from "@/lib/types";
import { fromLagos, lagosInputs } from "./parts";

/**
 * Start a crew for an event: where you're coming from, where and when to meet, how many, and whether people
 * join straight away or ask first. Starts out meeting an hour before the event, asking to join, 10 people.
 */
export function StartCrewModal({ event, open, onClose, onCreated }: { event: Pick<EventDTO, "id" | "title" | "startsAt" | "neighborhood">; open: boolean; onClose: () => void; onCreated: (c: CrewDTO) => void }) {
  // an hour before the event (or half an hour from now, if that's sooner than that)
  const [start] = useState(() => lagosInputs(new Date(Math.max(Date.now() + 30 * 60_000, new Date(event.startsAt).getTime() - 3600_000)).toISOString()));
  const [area, setArea] = useState("");
  const [meetupPoint, setMeetupPoint] = useState("");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [note, setNote] = useState("");
  const [joinMode, setJoinMode] = useState<CrewJoinMode>("approval");
  const [maxMembers, setMaxMembers] = useState("10");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (area.trim().length < 2) next.area = "Where are you coming from? A neighbourhood or landmark.";
    if (meetupPoint.trim().length < 2) next.meetupPoint = "Where should the crew meet?";
    if (!date || !time) next.meetupAt = "Pick a meetup date and time.";
    const max = Math.round(Number(maxMembers));
    if (!Number.isFinite(max) || max < 2 || max > 100) next.maxMembers = "Between 2 and 100 people, you included.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await CrewService.create(event.id, { area: area.trim(), meetupPoint: meetupPoint.trim(), meetupAt: fromLagos(date, time), note: note.trim(), joinMode, maxMembers: max });
      onCreated(res.data);
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a crew" description={`Find people to go to ${event.title} with. One crew per person per event.`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Coming from" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} placeholder={event.neighborhood ? `e.g. Yaba, Lekki Phase 1` : "e.g. Yaba"} error={errors.area} hint="Your area, so people near you find your crew." />
        <TextField label="Meetup point" value={meetupPoint} onChange={(e) => setMeetupPoint(e.target.value)} maxLength={120} placeholder="e.g. Yaba bus stop, by the Shoprite entrance" error={errors.meetupPoint} hint="Somewhere public. Only people in the crew see it." />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Meetup date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.meetupAt} />
          <TextField label="Meetup time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="Lagos time (WAT)" />
        </div>
        <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} counter={300} placeholder="e.g. Sharing a Bolt from there. First time going, come say hi!" />

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-medium">Who can join</legend>
          {(
            [
              ["approval", "Ask to join", "You accept each person first. Safer with people you don't know."],
              ["open", "Open", "Anyone who can see the event joins straight away."],
            ] as const
          ).map(([id, title, hint]) => (
            <label key={id} className={cx("flex cursor-pointer items-start gap-3 rounded-control border bg-raised p-3 transition", joinMode === id ? "border-accent-text" : "border-line")}>
              <input type="radio" name="crew-join" checked={joinMode === id} onChange={() => setJoinMode(id)} className="mt-1 accent-[var(--accent-text)]" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <TextField label="Crew size" type="number" inputMode="numeric" min={2} max={100} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} error={errors.maxMembers} hint="Up to 100, you included." />

        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
          The crew and its chat disappear a day after the event.
        </p>
        {formError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Start crew
          </Button>
        </div>
      </form>
    </Modal>
  );
}
