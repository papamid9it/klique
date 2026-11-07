"use client";

import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { setHomeStyle, useHomeStyle } from "@/lib/hooks/useHomeStyle";
import type { HomeStyle } from "@/lib/constants";

const OPTIONS: { id: HomeStyle; label: string; hint: string }[] = [
  { id: "casual", label: "Casual", hint: "Posts, events and kliques to scroll." },
  { id: "communities", label: "Communities", hint: "Just the places you joined, no scrolling." },
];

/** Settings: what Home shows on this device. First on the page, with a small picture of each. */
export function HomeStyleCard() {
  const style = useHomeStyle() ?? "casual";
  return (
    <section aria-labelledby="home-style" className="mb-8 rounded-card border border-line bg-surface p-5">
      <h2 id="home-style" className="text-base font-semibold">Home style</h2>
      <p className="mt-1 text-sm text-ink-muted">What you see when you open Klique on this device.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const on = style === o.id;
          return (
            <button key={o.id} type="button" aria-pressed={on} onClick={() => setHomeStyle(o.id)} className={cx("rounded-card border-2 p-3 text-left transition", on ? "border-ink" : "border-line hover:border-ink-muted")}>
              <span aria-hidden="true" className="flex h-24 flex-col gap-1.5 overflow-hidden rounded-control bg-raised p-2">
                {o.id === "casual" ? (
                  <>
                    <span className="h-12 shrink-0 rounded bg-ink/30" />
                    <span className="h-2 w-4/5 shrink-0 rounded bg-ink/15" />
                    <span className="h-2 w-1/2 shrink-0 rounded bg-ink/15" />
                  </>
                ) : (
                  <span className="grid flex-1 grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-1.5">
                    <span className="row-span-2 rounded bg-ink/35" />
                    <span className="rounded bg-ink/20" />
                    <span className="rounded bg-ink/20" />
                    <span className="rounded bg-ink/20" />
                    <span className="rounded bg-ink/20" />
                  </span>
                )}
              </span>
              <span className="mt-3 flex items-center justify-between font-semibold">
                {o.label}
                {on && <Icon name="check" size={16} />}
              </span>
              <span className="mt-0.5 block text-sm text-ink-muted">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
