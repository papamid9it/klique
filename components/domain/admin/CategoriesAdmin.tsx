"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CategoryService } from "@/app/services/CategoryService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { CATEGORY_SLUG, setCategories, type Category } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";
import { Panel } from "./AdminParts";

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

const INPUT = "h-9 min-w-0 rounded-control border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-ink-muted";

/**
 * Admin → Categories: what communities, events and people can be into. Rename, change the symbol, reorder, hide
 * or show, and add new ones. Nothing is deleted: a hidden category stays on whatever already uses it, it just
 * isn't offered any more (in pickers, filters and when new people join).
 */
export function CategoriesAdmin() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => CategoryService.adminList(), []);
  const [draft, setDraft] = useState<Category[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGlyph, setNewGlyph] = useState("");

  if (loading) return <Skeleton className="h-96 rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={() => void reload()} />;

  const saved = data.categories;
  const list = draft ?? saved;
  const known = new Set(saved.map((c) => c.id));
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const visible = list.filter((c) => !c.hidden).length;

  const edit = (i: number, patch: Partial<Category>) => setDraft(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...list];
    const [c] = next.splice(i, 1);
    next.splice(i + by, 0, c);
    setDraft(next);
  };
  const newId = slugOf(newName);
  const newProblem = !newName.trim() ? null : !CATEGORY_SLUG.test(newId) ? "Use at least 2 letters or numbers." : list.some((c) => c.id === newId) ? "There's already one called that." : null;
  const add = () => {
    if (!newName.trim() || newProblem) return;
    setDraft([...list, { id: newId, name: newName.trim(), short: newName.trim().slice(0, 16), glyph: newGlyph.trim() || "•" }]);
    setNewName("");
    setNewGlyph("");
  };

  async function save() {
    setSaving(true);
    try {
      const r = (await CategoryService.save(list)).data;
      setData({ categories: r.categories, usage: data!.usage });
      setCategories(r.categories); // this tab sees it straight away
      setDraft(null);
      toast("Categories saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel title={`${list.length} categories · ${visible} offered`}>
        <ul className="divide-y divide-line px-4">
          {list.map((c, i) => {
            const u = data.usage[c.id];
            return (
              <li key={c.id} className={cx("flex gap-2 py-3", c.hidden && "opacity-60")}>
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised disabled:opacity-30">
                    <Icon name="arrowdown" size={13} className="rotate-180" />
                  </button>
                  <button type="button" aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)} className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised disabled:opacity-30">
                    <Icon name="arrowdown" size={13} />
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input aria-label={`Symbol for ${c.name}`} value={c.glyph} maxLength={4} onChange={(e) => edit(i, { glyph: e.target.value })} className={cx(INPUT, "w-14 shrink-0 text-center text-base")} />
                    <input aria-label="Name" value={c.name} maxLength={40} onChange={(e) => edit(i, { name: e.target.value })} className={cx(INPUT, "flex-1")} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label={`Short label for ${c.name}`} placeholder="Short label" value={c.short} maxLength={16} onChange={(e) => edit(i, { short: e.target.value })} className={cx(INPUT, "w-36")} />
                    <Button size="sm" onClick={() => edit(i, { hidden: !c.hidden })}>
                      <Icon name={c.hidden ? "plus" : "x"} size={13} /> {c.hidden ? "Show" : "Hide"}
                    </Button>
                    <p className="min-w-0 basis-full font-mono text-[11px] text-ink-muted sm:basis-auto">
                      {c.id}
                      {!known.has(c.id) && " · new, not saved yet"}
                      {c.hidden && " · hidden"}
                      {u ? ` · ${u.communities} communities · ${u.events} upcoming events · ${u.people} people` : known.has(c.id) ? " · not used yet" : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Add a category">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-20">
            <TextField label="Symbol" value={newGlyph} maxLength={4} placeholder="•" onChange={(e) => setNewGlyph(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1 basis-56">
            <TextField label="Name" value={newName} maxLength={40} placeholder="e.g. Gaming" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} error={newProblem ?? undefined} hint={newName && !newProblem ? `Saved as "${newId}". This short name can't change later.` : undefined} />
          </div>
          <Button onClick={add} disabled={!newName.trim() || !!newProblem}>
            <Icon name="plus" size={14} /> Add
          </Button>
        </div>
      </Panel>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-card border border-line bg-surface/95 p-3 backdrop-blur">
        <p className="mr-auto text-[13px] text-ink-muted">{visible < 3 ? "Keep at least 3 offered: new people pick 3 when they join." : dirty ? "You have unsaved changes." : "Hidden categories stay on whatever already uses them."}</p>
        {dirty && <Button onClick={() => setDraft(null)}>Undo changes</Button>}
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || visible < 3}>
          Save categories
        </Button>
      </div>
    </div>
  );
}
