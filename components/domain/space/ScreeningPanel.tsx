"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import type { ScreeningDTO, ScreeningQuestion } from "@/lib/types";

const MAX = 5;
const newId = () => Math.random().toString(36).slice(2, 10);
const KINDS: { id: ScreeningQuestion["kind"]; label: string }[] = [
  { id: "text", label: "Short answer" },
  { id: "choice", label: "Multiple choice" },
  { id: "agree", label: "I agree (a checkbox)" },
];

/**
 * Community settings → Entry questions (owners and admins): up to 5 questions everyone answers before joining, and
 * a switch. Public: they join right after answering. Private: the answers go with their request. Changing these
 * doesn't affect people already in.
 */
export function ScreeningPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => SpaceService.screening(slug), [slug], { key: `screening:${slug}` });
  const [draft, setDraft] = useState<ScreeningDTO | null>(null);
  const [saving, setSaving] = useState(false);
  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const d = draft ?? data;
  const edit = (next: Partial<ScreeningDTO>) => setDraft({ ...d, ...next });
  const editQ = (i: number, patch: Partial<ScreeningQuestion>) => edit({ questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  async function save() {
    setSaving(true);
    try {
      const res = await SpaceService.setScreening(slug, { enabled: d.enabled && d.questions.length > 0, questions: d.questions.map((q) => ({ ...q, options: q.kind === "choice" ? q.options.map((o) => o.trim()).filter(Boolean) : [] })) });
      setDraft(null);
      await reload();
      toast(res.data.enabled ? "Entry questions are on" : "Entry questions saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Switch checked={d.enabled} onChange={(v) => edit({ enabled: v })} label="Ask entry questions" hint="Everyone joining answers these first, public or private. People already in aren't asked." />

      <ol className="space-y-3">
        {d.questions.map((q, i) => (
          <li key={q.id} className="space-y-3 rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-muted">Question {i + 1}</span>
              <button type="button" onClick={() => edit({ questions: d.questions.filter((_, j) => j !== i) })} aria-label={`Remove question ${i + 1}`} className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                <Icon name="trash" size={15} />
              </button>
            </div>
            <TextField label="Question" value={q.prompt} onChange={(e) => editQ(i, { prompt: e.target.value })} maxLength={200} placeholder={q.kind === "agree" ? "I've read the rules and I'll be kind" : "What do you skate?"} />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Answer type" value={q.kind} onChange={(e) => editQ(i, { kind: e.target.value as ScreeningQuestion["kind"], options: e.target.value === "choice" && q.options.length < 2 ? ["", ""] : q.options })}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </SelectField>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input type="checkbox" checked={q.required} onChange={(e) => editQ(i, { required: e.target.checked })} className="accent-[var(--accent-text)]" />
                Required
              </label>
            </div>
            {q.kind === "choice" && (
              <div className="space-y-2">
                {q.options.map((o, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <TextField label={`Choice ${k + 1}`} value={o} onChange={(e) => editQ(i, { options: q.options.map((x, n) => (n === k ? e.target.value : x)) })} maxLength={80} />
                    {q.options.length > 2 && (
                      <button type="button" aria-label={`Remove choice ${k + 1}`} onClick={() => editQ(i, { options: q.options.filter((_, n) => n !== k) })} className="mt-6 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised">
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < 8 && (
                  <Button size="sm" variant="ghost" onClick={() => editQ(i, { options: [...q.options, ""] })}>
                    <Icon name="plus" size={13} /> Add a choice
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {d.questions.length < MAX && (
        <Button onClick={() => edit({ questions: [...d.questions, { id: newId(), kind: "text", prompt: "", options: [], required: true }] })}>
          <Icon name="plus" size={14} /> Add a question ({d.questions.length}/{MAX})
        </Button>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {draft && <Button onClick={() => setDraft(null)}>Undo changes</Button>}
        <Button variant="primary" loading={saving} disabled={!draft} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
