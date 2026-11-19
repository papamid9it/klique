"use client";

import { useEffect, useState } from "react";
import type { CommunityDTO } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * A new community's first steps, for its owner (the server sends `setup` only to them, for two weeks): what it's
 * about, a first hello, five people, a first event. Each row opens the place to do it. Hidden once all four are
 * done, or when the owner closes it (remembered on this device).
 */
export function SetupChecklist({ c, onGo, onInvite }: { c: CommunityDTO; onGo: (href: string) => void; onInvite: () => void }) {
  const key = `klique.setup-hidden.${c.id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);
  const s = c.setup;
  if (!s || hidden) return null;
  const others = Math.max(0, (c.memberCount ?? 1) - 1);
  const base = `/communities/${c.slug}`;
  const steps = [
    { done: s.about, label: "Say what it's about", hint: "A short description people see before joining", go: () => onGo(`${base}?settings=overview`) },
    { done: s.welcome, label: "Post a welcome", hint: "Say hello in chat or Posts", go: () => onGo(base) },
    { done: s.invited, label: "Invite 5 people", hint: `${Math.min(5, others)} of 5 so far`, go: onInvite },
    { done: s.event, label: "Plan the first event", hint: "Something to meet up for", go: () => onGo(`/events/new?community=${encodeURIComponent(c.slug)}`) },
  ];
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private window: it comes back next visit */
    }
  };
  return (
    <section aria-label="Get your community started" className="mb-3 rounded-card border border-line bg-surface p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Get started</p>
          <p className="text-xs text-ink-muted">{done} of {steps.length} done</p>
        </div>
        <button type="button" onClick={close} aria-label="Hide the checklist" className="grid size-7 place-items-center rounded-control text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <div className="h-full rounded-full bg-ink" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="space-y-0.5">
        {steps.map((x) => (
          <li key={x.label}>
            <button type="button" onClick={x.go} disabled={x.done} className={cx("flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left", x.done ? "cursor-default" : "hover:bg-raised")}>
              <span className={cx("grid size-5 shrink-0 place-items-center rounded-full border", x.done ? "border-ink bg-ink text-canvas" : "border-line")} aria-hidden="true">
                {x.done && <Icon name="check" size={12} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-sm", x.done ? "text-ink-muted line-through" : "font-medium text-ink")}>{x.label}</span>
                {!x.done && <span className="block truncate text-xs text-ink-muted">{x.hint}</span>}
              </span>
              <span className="sr-only">{x.done ? "Done" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
