"use client";

import { useState } from "react";
import { SpaceService } from "@/app/services/SpaceService";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { LIMITS } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";
import type { EntryAnswer } from "@/lib/types";

/**
 * Before joining a community with entry questions: answer them (a short answer, a choice, or "I agree"), then join
 * (public) or send the request (private, with an optional note). The server checks the answers too.
 */
export function EntryQuestionsModal({ slug, name, isPrivate, busy, onClose, onSubmit }: { slug: string; name: string; isPrivate: boolean; busy: boolean; onClose: () => void; onSubmit: (answers: Record<string, string | boolean>, message?: string) => void }) {
  const { data, loading } = useApi(() => SpaceService.screening(slug), [slug], { key: `screening:${slug}` });
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const qs = data?.questions ?? [];
  const set = (id: string, v: string | boolean) => setAnswers((a) => ({ ...a, [id]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const gap = qs.find((q) => q.required && (q.kind === "agree" ? answers[q.id] !== true : !String(answers[q.id] ?? "").trim()));
    if (gap) return setMissing(gap.id);
    setMissing(null);
    onSubmit(answers, note.trim() || undefined);
  }

  return (
    <Modal open onClose={onClose} title={`Before you join ${name}`} description={isPrivate ? "Answer these and your request goes to the admins." : "A few questions from the community. You're in as soon as you answer."}>
      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {qs.map((q, i) => (
            <div key={q.id} className={cx("space-y-2", missing === q.id && "rounded-control ring-2 ring-danger/60 ring-offset-4 ring-offset-surface")}>
              {q.kind === "agree" ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-raised p-3">
                  <input type="checkbox" checked={answers[q.id] === true} onChange={(e) => set(q.id, e.target.checked)} className="mt-0.5 accent-[var(--accent-text)]" />
                  <span className="text-sm">
                    {q.prompt}
                    {!q.required && <span className="text-ink-muted"> (optional)</span>}
                  </span>
                </label>
              ) : q.kind === "choice" ? (
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium">
                    {i + 1}. {q.prompt}
                    {!q.required && <span className="text-ink-muted"> (optional)</span>}
                  </legend>
                  <div className="space-y-1.5">
                    {q.options.map((o) => (
                      <label key={o} className={cx("flex cursor-pointer items-center gap-2.5 rounded-control border bg-raised px-3 py-2 text-sm", answers[q.id] === o ? "border-accent-text" : "border-line")}>
                        <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === o} onChange={() => set(q.id, o)} className="accent-[var(--accent-text)]" />
                        {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <TextField label={`${i + 1}. ${q.prompt}${q.required ? "" : " (optional)"}`} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} maxLength={500} />
              )}
            </div>
          ))}
          {isPrivate && <TextArea label="Say hi (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.requestMessage} counter={LIMITS.requestMessage} />}
          {missing && <p className="text-sm font-medium text-danger">Please answer the highlighted question.</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              {isPrivate ? "Send request" : "Join"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Someone's answers to the entry questions, for the owner and admins (requests and members lists). */
export function EntryAnswers({ answers, className }: { answers?: EntryAnswer[]; className?: string }) {
  if (!answers?.length) return null;
  return (
    <dl className={cx("space-y-1.5 rounded-control border border-line bg-raised/60 p-3 text-[13px]", className)}>
      {answers.map((a, i) => (
        <div key={i}>
          <dt className="text-xs text-ink-muted">{a.prompt}</dt>
          <dd className="break-words">{a.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
