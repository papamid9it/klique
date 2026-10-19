"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { cx } from "./cx";

export interface SettingsItem {
  id: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  /** hide the item (e.g. private-only sections) */
  hidden?: boolean;
}
export interface SettingsGroup {
  title?: string;
  items: SettingsItem[];
}

/**
 * Full-screen, Discord-style settings: category list on the left, content in the middle,
 * round close button with ESC hint on the right. On phones it shows the list first, then one page.
 * Esc closes unless a dialog (confirm, modal) is open on top.
 */
export function SettingsShell({
  heading,
  groups,
  active,
  onSelect,
  onClose,
  title,
  children,
  footer,
}: {
  /** small label above the list, e.g. the community name */
  heading: string;
  groups: SettingsGroup[];
  active: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [menu, setMenu] = useState(false); // phones: showing the category list
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open], [role='menu']")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const list = (
    <nav aria-label={`${heading} settings`} className="space-y-5">
      {groups.map((g, gi) => {
        const items = g.items.filter((i) => !i.hidden);
        if (!items.length) return null;
        return (
          <div key={gi} className={cx(gi > 0 && g.items.some((i) => i.danger) && "border-t border-line pt-3")}>
            {g.title && <p className="eyebrow mb-1.5 px-2.5">{g.title}</p>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(it.id);
                      setMenu(false);
                    }}
                    aria-current={active === it.id && !menu ? "page" : undefined}
                    className={cx(
                      "flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-left text-[15px] font-medium transition md:h-9",
                      it.danger ? (active === it.id ? "bg-danger/15 text-danger" : "text-danger hover:bg-danger/10") : active === it.id ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink",
                    )}
                  >
                    <Icon name={it.icon} size={17} /> {it.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${heading} settings`} className="fixed inset-0 z-[120] overflow-y-auto bg-canvas md:flex md:overflow-hidden">
      {/* categories */}
      <div className={cx("bg-surface max-md:min-h-dvh md:flex md:flex-1 md:justify-end md:overflow-y-auto", menu ? "block" : "hidden md:flex")}>
        <div className="w-full px-4 pt-5 pb-10 md:w-[17.5rem] md:px-3 md:pt-14 md:pb-8">
          <div className="mb-5 flex items-center justify-between md:hidden">
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em]">{heading}</h1>
            <button type="button" onClick={onClose} aria-label="Close settings" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted">
              <Icon name="x" size={17} />
            </button>
          </div>
          <p className="eyebrow mb-3 hidden truncate px-2.5 md:block">{heading}</p>
          {list}
          {footer && <div className="mt-4 border-t border-line pt-3">{footer}</div>}
        </div>
      </div>

      {/* page */}
      <div className={cx("min-w-0 md:h-dvh md:flex-[2.1] md:overflow-y-auto", menu ? "hidden md:block" : "block")}>
        <div className="flex gap-10 px-4 pt-5 pb-28 md:px-10 md:pt-14">
          <main className="min-w-0 flex-1 md:max-w-[46rem]">
            <div className="mb-6 flex items-center gap-2">
              <button type="button" onClick={() => setMenu(true)} aria-label="Back to settings menu" className="-ml-1 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised md:hidden">
                <Icon name="arrow-left" size={18} />
              </button>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
            </div>
            {children}
          </main>
          <div className="hidden shrink-0 md:block">
            <button type="button" onClick={onClose} aria-label="Close settings (Esc)" className="group sticky top-0 flex flex-col items-center gap-1.5">
              <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-ink-muted/60 text-ink-muted transition group-hover:border-ink group-hover:text-ink">
                <Icon name="x" size={17} />
              </span>
              <span className="font-mono text-[11px] font-semibold text-ink-muted">ESC</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A titled block inside a settings page. */
export function SettingsBlock({ title, intro, children, danger }: { title?: string; intro?: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={cx("border-t border-line pt-6 first:border-0 first:pt-0", "mb-8 last:mb-0", danger && "rounded-card border border-danger/30 p-5 first:border")}>
      {title && <h3 className="eyebrow mb-2">{title}</h3>}
      {intro && <p className="mb-4 text-sm text-ink-muted">{intro}</p>}
      {children}
    </section>
  );
}

/**
 * Discord's "Careful — you have unsaved changes!" bar. Sticks to the bottom of the page
 * while `dirty`, with Reset and Save Changes.
 */
export function SaveBar({ dirty, busy, onReset, onSave, disabled }: { dirty: boolean; busy?: boolean; onReset: () => void; onSave: () => void; disabled?: boolean }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-10 mt-8" role="region" aria-label="Unsaved changes">
      <div className="flex animate-pop items-center gap-3 rounded-card border border-line bg-canvas px-4 py-3 shadow-2xl ring-1 ring-black/30">
        <p className="min-w-0 flex-1 text-sm font-medium">Careful — you have unsaved changes!</p>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={busy}>
          Reset
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={busy} disabled={disabled}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
