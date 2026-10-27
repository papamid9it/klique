"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * A page's own left panel. The home panel (HomePanel) keeps the logo and your account card and leaves a slot in
 * between; pages with their own sections (Communities, Saved, Notifications, Events) fill it with <PagePanel>,
 * always starting with Home. On phones and tablets there's no panel, so those pages show the same choices in the
 * page itself.
 */
const SlotCtx = createContext<{ el: HTMLElement | null; setEl: (el: HTMLElement | null) => void } | null>(null);

export function PanelSlotProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return <SlotCtx.Provider value={{ el, setEl }}>{children}</SlotCtx.Provider>;
}

/** Where pages' panels appear (inside HomePanel). */
export function PanelSlot({ className }: { className?: string }) {
  const ctx = useContext(SlotCtx);
  return <div ref={ctx?.setEl} className={className} />;
}

/** Pages that bring their own panel (HomePanel leaves out its main nav, search and place for these). */
export const hasPagePanel = (p: string) => p === "/communities" || p.startsWith("/saved") || p.startsWith("/notifications") || p === "/events" || /^\/events\/(?!new$)[^/]+$/.test(p);

export function PagePanel({ label, children }: { label: string; children: ReactNode }) {
  const el = useContext(SlotCtx)?.el;
  if (!el) return null;
  return createPortal(
    <nav aria-label={label} className="space-y-5">
      <ul>
        <li>
          <PanelItem href="/" icon="home">
            Home
          </PanelItem>
        </li>
      </ul>
      {children}
    </nav>,
    el,
  );
}

const row = "flex h-10 w-full items-center gap-3 rounded-control px-3 text-left text-[14px] font-medium transition";
const tone = (on?: boolean) => (on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink");

const openKey = (id: string) => `klique:panel-open:${id}`;

/**
 * A titled group of panel items. `collapse` makes the title a toggle (chevron, smooth open and close) that shows
 * `summary` (the current choice) while closed; whether it's open is remembered on this device.
 */
export function PanelSection({ title, children, action, collapse }: { title: string; children: ReactNode; action?: ReactNode; collapse?: { id: string; summary?: string; defaultOpen?: boolean } }) {
  const [open, setOpen] = useState(collapse?.defaultOpen ?? true);
  const bodyId = useId();
  // what this device remembers is only readable in the browser, after the first paint
  useEffect(() => {
    if (!collapse) return;
    try {
      const v = localStorage.getItem(openKey(collapse.id));
      if (v === "1" || v === "0") setOpen(v === "1");
    } catch {
      /* storage blocked: keep the default */
    }
  }, [collapse?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!collapse) {
    return (
      <section>
        <div className="mb-1.5 flex items-center justify-between px-3">
          <h2 className="eyebrow">{title}</h2>
          {action}
        </div>
        <ul className="space-y-0.5">{children}</ul>
      </section>
    );
  }
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(openKey(collapse.id), next ? "1" : "0");
    } catch {
      /* not remembered this time */
    }
  };
  return (
    <section>
      <h2>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="flex h-8 w-full items-center gap-2 rounded-control px-3 text-left transition hover:bg-raised/60">
          <span className="eyebrow shrink-0">{title}</span>
          {!open && collapse.summary && <span className="min-w-0 flex-1 truncate text-right text-[12px] font-medium text-ink">{collapse.summary}</span>}
          <Icon name="chevron-down" size={14} className={cx("ml-auto shrink-0 text-ink-muted transition-transform duration-200 motion-reduce:transition-none", !open && "-rotate-90")} />
        </button>
      </h2>
      {/* grid rows 0fr ↔ 1fr animates the height without measuring it */}
      <div id={bodyId} className={cx("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
        <ul className="min-h-0 space-y-0.5 overflow-hidden pt-1">{children}</ul>
      </div>
    </section>
  );
}

function Count({ n }: { n?: number | string | null }) {
  if (!n) return null;
  return <span className="ml-auto font-mono text-[11px] text-ink-muted">{typeof n === "number" && n > 999 ? "999+" : n}</span>;
}

/**
 * One panel row: a link (`href`) or a button (`onClick`), with an icon or a glyph and an optional count (dim
 * text). `dot`: something new here (a small accent dot and a bold label).
 */
export function PanelItem({ href, onClick, on, icon, glyph, count, badge, dot, children }: { href?: string; onClick?: () => void; on?: boolean; icon?: IconName; glyph?: string; count?: number | string | null; badge?: number; dot?: boolean; children: ReactNode }) {
  const inner = (
    <>
      {icon ? <Icon name={icon} size={16} /> : <span aria-hidden="true" className="w-4 text-center text-[15px]">{glyph}</span>}
      <span className={cx("min-w-0 flex-1 truncate", dot && "font-semibold text-ink")}>{children}</span>
      {dot && <span aria-label="New" className="size-2 shrink-0 rounded-full bg-accent" />}
      {badge ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{badge > 99 ? "99+" : badge}</span> : <Count n={count} />}
    </>
  );
  return href ? (
    <Link href={href} aria-current={on ? "page" : undefined} className={cx(row, tone(on))}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx(row, tone(on))}>
      {inner}
    </button>
  );
}
