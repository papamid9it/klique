"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { PollService, type PollInput } from "@/app/services/PollService";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { useNow } from "@/lib/hooks/useApi";
import type { PollDTO, UserBrief } from "@/lib/types";

const DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 4, label: "4 hours" },
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];
const MAX_ANSWERS = 10;

/** Start a poll: a question, 2 to 10 answers (each with an emoji if you like), one or several picks, how long. */
export function PollComposer({ onClose, onCreate }: { onClose: () => void; onCreate: (input: PollInput) => Promise<string | null> }) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([{ text: "", emoji: "" }, { text: "", emoji: "" }]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = answers.filter((a) => a.text.trim());
  const ready = question.trim() && filled.length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const err = await onCreate({ question: question.trim(), answers: filled.map((a) => ({ text: a.text.trim(), ...(a.emoji.trim() ? { emoji: a.emoji.trim() } : {}) })), multiple, anonymous, hours });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal open onClose={onClose} title="Create a poll" description="Everyone here can vote until it ends, and change their vote meanwhile.">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} autoFocus placeholder="What should we do on Saturday?" />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Answers</legend>
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={a.emoji} onChange={(e) => setAnswers((x) => x.map((y, k) => (k === i ? { ...y, emoji: e.target.value } : y)))} maxLength={4} placeholder="🙂" aria-label={`Emoji for answer ${i + 1} (optional)`} className="h-10 w-12 shrink-0 rounded-control border border-line bg-raised text-center text-[17px] focus:border-accent-text focus:outline-none" />
              <input value={a.text} onChange={(e) => setAnswers((x) => x.map((y, k) => (k === i ? { ...y, text: e.target.value } : y)))} maxLength={55} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`} className="h-10 min-w-0 flex-1 rounded-control border border-line bg-raised px-3 text-sm focus:border-accent-text focus:outline-none" />
              {answers.length > 2 && (
                <button type="button" onClick={() => setAnswers((x) => x.filter((_, k) => k !== i))} aria-label={`Remove answer ${i + 1}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
          {answers.length < MAX_ANSWERS && (
            <Button size="sm" variant="ghost" onClick={() => setAnswers((x) => [...x, { text: "", emoji: "" }])}>
              <Icon name="plus" size={14} /> Add an answer
            </Button>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Runs for" value={String(hours)} onChange={(e) => setHours(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.hours} value={d.hours}>
                {d.label}
              </option>
            ))}
          </SelectField>
          <div className="space-y-2 pt-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-[var(--accent-text)]" /> Allow more than one answer
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-[var(--accent-text)]" /> Anonymous (hide who voted)
            </label>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            Post poll
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "3h left", "12m left", "Ends soon". */
function timeLeft(endsAt: string, now: Date) {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 60_000) return "Ends soon";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h left` : `${Math.round(h / 24)}d left`;
}

/** Live polls check for new votes this often while they're on screen and running. */
const REFRESH_MS = 8000;

/**
 * A poll in a chat, Discord style: tap an answer to vote (tap again to take it back; several when allowed),
 * results as bars with percentages, the vote count and time left, then "Poll ended" with the winner marked.
 * Its creator or an admin can end it early. Tapping a count shows who picked it (unless it's anonymous).
 */
export function PollCard({ id }: { id: string }) {
  const toast = useToast();
  const card = useProfileCard();
  const now = useNow(30_000);
  const [poll, setPoll] = useState<PollDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voters, setVoters] = useState<{ answer: string; people: UserBrief[] | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setPoll((await PollService.get(id)).data);
    } catch {
      setFailed(true);
    }
  }, [id]);

  // first load, then keep it live while it's running and on screen (votes come in, it may end)
  useEffect(() => {
    void load();
  }, [load]);
  const running = !!poll && !poll.ended;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const r = box.current?.getBoundingClientRect();
      if (document.visibilityState === "visible" && r && r.bottom > 0 && r.top < window.innerHeight) void load();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [running, load]);

  async function vote(answerId: string) {
    if (!poll || busy || !poll.canVote) return;
    const picked = poll.myVotes.includes(answerId);
    const next = poll.multiple ? (picked ? poll.myVotes.filter((a) => a !== answerId) : [...poll.myVotes, answerId]) : picked ? [] : [answerId];
    setBusy(true);
    try {
      setPoll((await PollService.vote(poll.id, next)).data);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!poll) return;
    try {
      setPoll((await PollService.end(poll.id)).data);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function showVoters(answerId: string) {
    if (!poll?.votersVisible) return;
    setVoters({ answer: answerId, people: null });
    try {
      const res = await PollService.voters(poll.id, answerId);
      setVoters({ answer: answerId, people: res.data });
    } catch (e) {
      setVoters(null);
      toast(errorMessage(e), "error");
    }
  }

  if (failed) return <p className="text-sm text-ink-muted italic">This poll is gone.</p>;
  if (!poll) return <Skeleton className="my-1 h-40 w-full max-w-md rounded-card" />;

  const totalPicks = poll.answers.reduce((s, a) => s + a.votes, 0);
  const top = Math.max(0, ...poll.answers.map((a) => a.votes));
  const showResults = poll.ended || poll.myVotes.length > 0 || !poll.canVote;
  const answerName = poll.answers.find((a) => a.id === voters?.answer);

  return (
    <div ref={box} className="my-1 w-full max-w-md rounded-card border border-line bg-surface p-4" role="group" aria-label={`Poll: ${poll.question}`}>
      <p className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide text-ink-muted uppercase">
        <Icon name="topics" size={12} /> Poll{poll.multiple ? " · pick any" : ""}
        {poll.anonymous ? " · anonymous" : ""}
      </p>
      <h3 className="mt-1.5 text-[15.5px] leading-snug font-semibold break-words">{poll.question}</h3>
      <ul className="mt-3 space-y-2">
        {poll.answers.map((a) => {
          const pct = totalPicks ? Math.round((a.votes / poll.totalVoters) * 100) : 0;
          const mine = poll.myVotes.includes(a.id);
          const winner = poll.ended && a.votes > 0 && a.votes === top;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => void vote(a.id)}
                disabled={!poll.canVote || busy}
                aria-pressed={mine}
                className={cx("relative flex w-full items-center gap-2.5 overflow-hidden rounded-control border px-3 py-2.5 text-left text-[14px] transition disabled:cursor-default", mine ? "border-accent-text" : winner ? "border-success/60" : "border-line", poll.canVote && "hover:border-ink-muted")}
              >
                {showResults && <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 transition-[width] duration-500", winner ? "bg-success/20" : mine ? "bg-accent/20" : "bg-raised")} style={{ width: `${pct}%` }} />}
                <span className={cx("relative inline-flex size-4 shrink-0 items-center justify-center border", poll.multiple ? "rounded-[4px]" : "rounded-full", mine ? "border-accent-text bg-accent text-accent-ink" : "border-ink-muted")}>{mine && <Icon name="check" size={10} />}</span>
                {a.emoji && <span className="relative text-[16px] leading-none">{a.emoji}</span>}
                <span className="relative min-w-0 flex-1 truncate font-medium">{a.text}</span>
                {winner && <Icon name="check" size={14} className="relative text-success" aria-label="Winner" />}
                {showResults && <span className="relative font-mono text-[12px] font-semibold tabular-nums">{pct}%</span>}
              </button>
              {showResults && poll.votersVisible && a.votes > 0 && (
                <button type="button" onClick={() => void showVoters(a.id)} className="mt-0.5 ml-1 text-[11.5px] text-ink-muted hover:text-ink hover:underline">
                  {a.votes} {a.votes === 1 ? "vote" : "votes"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-muted">
        <span>
          {poll.totalVoters} {poll.totalVoters === 1 ? "vote" : "votes"} · {poll.ended ? <span className="font-semibold text-ink">Poll ended</span> : now ? timeLeft(poll.endsAt, now) : ""}
        </span>
        {poll.canEnd && (
          <button type="button" onClick={() => void end()} className="font-semibold hover:text-ink hover:underline">
            End poll now
          </button>
        )}
      </div>
      <Modal open={!!voters} onClose={() => setVoters(null)} size="sm" title={answerName ? `${answerName.emoji ? `${answerName.emoji} ` : ""}${answerName.text}` : "Voters"}>
        {!voters?.people ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="-mx-2 max-h-[50dvh] space-y-0.5 overflow-y-auto">
            {voters.people.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => card.openFull(u.handle)} className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-raised">
                  <Avatar name={u.displayName} src={u.avatarUrl} frame={u.avatarFrame} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      <UserName name={u.displayName} effect={u.nameEffect} />
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-muted">@{u.handle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
