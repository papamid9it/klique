"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import {
  scopeChildren,
  scopeFlag,
  scopeLabel,
  scopeParent,
  scopeToString,
  scopeTrail,
  scopeTrailList,
  searchScopes,
  WORLD,
  type Scope,
} from "@/lib/places";

const LEVEL_NOUN: Record<Scope["level"], string> = { world: "everywhere", continent: "continent", country: "country", region: "state", city: "city" };

function Row({ scope, onPick, onDrill, count, active }: { scope: Scope; onPick: () => void; onDrill?: () => void; count?: number; active?: boolean }) {
  return (
    <li className={cx("flex items-center gap-1 rounded-control", active && "bg-accent/10")}>
      <button type="button" onClick={onPick} className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-3 py-2.5 text-left hover:bg-raised">
        <span className="w-6 shrink-0 text-center text-lg leading-none" aria-hidden="true">{scopeFlag(scope)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{scopeLabel(scope)}</span>
          <span className="block truncate text-[11px] text-ink-muted">{scopeTrail(scope)}</span>
        </span>
        {count !== undefined && <span className="font-mono text-[11px] text-ink-muted">{count}</span>}
        {active && <Icon name="check" size={15} className="text-accent-text" />}
      </button>
      {onDrill && (
        <button type="button" onClick={onDrill} aria-label={`Browse inside ${scopeLabel(scope)}`} title="Browse inside" className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="chevron-right" size={16} />
        </button>
      )}
    </li>
  );
}

/**
 * "Where?" — pick everywhere, a continent, a country, a state or a city.
 * Search finds any of them; otherwise drill down from the top. Tapping a name chooses it; the arrow goes inside.
 */
export function PlacePicker({
  open,
  onClose,
  value,
  onChange,
  home,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  value: Scope;
  onChange: (s: Scope) => void;
  /** a shortcut row for the person's own city */
  home?: Scope;
  /** optional event counts by scope string, shown beside rows */
  counts?: Record<string, number>;
}) {
  const [browse, setBrowse] = useState<Scope>(value);
  const [q, setQ] = useState("");

  // Open where you currently are (a city opens its state, so its neighbours show).
  useEffect(() => {
    if (open) setBrowse(scopeChildren(value).length ? value : (scopeParent(value) ?? value));
  }, [open, value]);

  const pick = (s: Scope) => {
    onChange(s);
    onClose();
    setQ("");
  };
  const results = q.trim() ? searchScopes(q, 14) : null;
  const children = scopeChildren(browse);
  const trail = scopeTrailList(browse);
  const parent = scopeParent(browse);
  const cur = scopeToString(value);

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        setQ("");
      }}
      title="Where are you looking?"
      description="Pick a city, a state, a whole country, a continent or everywhere."
    >
      <div className="relative">
        <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a city, state or country…"
          aria-label="Search places"
          className="h-11 w-full rounded-control border border-line bg-raised pr-3 pl-10 text-[15px] placeholder:text-ink-muted/70 focus:border-accent-text"
        />
      </div>

      {results ? (
        <ul className="mt-3 space-y-0.5" aria-label="Matching places">
          {results.length ? (
            results.map((s) => <Row key={scopeToString(s)} scope={s} onPick={() => pick(s)} count={counts?.[scopeToString(s)]} active={scopeToString(s) === cur} />)
          ) : (
            <li className="rounded-card border border-dashed border-line p-4 text-center text-sm text-ink-muted">No match. You can still type any town when you add an event.</li>
          )}
        </ul>
      ) : (
        <>
          {browse.level === "world" && (
            <ul className="mt-3 space-y-0.5">
              <Row scope={WORLD} onPick={() => pick(WORLD)} active={cur === "world"} />
              {home && home.level !== "world" && <Row scope={home} onPick={() => pick(home)} active={scopeToString(home) === cur} />}
            </ul>
          )}

          <nav aria-label="Where" className="mt-4 flex flex-wrap items-center gap-1 text-[13px]">
            {trail.map((t, i) => (
              <span key={scopeToString(t)} className="inline-flex items-center gap-1">
                {i > 0 && <Icon name="chevron-right" size={12} className="text-ink-muted" />}
                <button type="button" onClick={() => setBrowse(t)} aria-current={i === trail.length - 1 ? "true" : undefined} className={cx("rounded-md px-1.5 py-0.5 font-semibold hover:bg-raised", i === trail.length - 1 ? "text-ink" : "text-ink-muted")}>
                  {scopeLabel(t)}
                </button>
              </span>
            ))}
          </nav>

          <ul className="mt-2 space-y-0.5">
            {browse.level !== "world" && (
              <li>
                <button type="button" onClick={() => pick(browse)} className="flex w-full items-center gap-3 rounded-control bg-accent/10 px-3 py-2.5 text-left text-sm font-semibold text-accent-text hover:bg-accent/15">
                  <span className="w-6 text-center text-lg leading-none" aria-hidden="true">{scopeFlag(browse)}</span>
                  All of {scopeLabel(browse)}
                  <span className="ml-auto text-[11px] font-normal text-ink-muted">the whole {LEVEL_NOUN[browse.level]}</span>
                </button>
              </li>
            )}
            {children.map((s) => (
              <Row key={scopeToString(s)} scope={s} onPick={() => (scopeChildren(s).length ? setBrowse(s) : pick(s))} onDrill={scopeChildren(s).length ? () => setBrowse(s) : undefined} count={counts?.[scopeToString(s)]} active={scopeToString(s) === cur} />
            ))}
            {!children.length && browse.level === "city" && parent && (
              <li className="px-3 py-2 text-sm text-ink-muted">That&apos;s the most specific level.</li>
            )}
          </ul>
        </>
      )}
    </Modal>
  );
}
