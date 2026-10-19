import type { ReactNode } from "react";

export function PageTitle({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[clamp(2rem,4.5vw,2.75rem)]">{title}</h1>
        {children && <p className="mt-2 max-w-xl text-[15px] text-ink-muted">{children}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * A big page header on a soft accent wash: eyebrow, title, a line of text, actions on the right and an
 * optional slot underneath (tabs, filters). Used by the wide pages (Saved, Communities).
 */
export function PageBanner({ eyebrow, title, action, children, footer }: { eyebrow?: string; title: string; action?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <header
      className="relative isolate mb-8 overflow-hidden rounded-[1.75rem] border border-line px-6 py-8 sm:px-10 sm:py-10"
      style={{ background: "linear-gradient(125deg, color-mix(in oklab, var(--accent) 22%, var(--surface)) 0%, var(--surface) 55%, color-mix(in oklab, var(--accent2) 16%, var(--surface)) 100%)" }}
    >
      <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-2/3 text-ink opacity-[0.07]">
        {Array.from({ length: 9 }).map((_, i) => (
          <circle key={i} cx={330} cy={100} r={20 + i * 22} fill="none" stroke="currentColor" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)]">{title}</h1>
          {children && <p className="mt-3 max-w-xl text-[15px] text-ink-muted">{children}</p>}
        </div>
        {action}
      </div>
      {footer && <div className="mt-7">{footer}</div>}
    </header>
  );
}

/** Pill-style segmented switch with an icon and an optional count. */
export function PillTabs<T extends string>({ label, items, active, onChange }: { label: string; items: { id: T; label: string; icon?: ReactNode; count?: number | null }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="no-bar -mx-1 flex gap-2 overflow-x-auto px-1">
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${on ? "border-transparent bg-ink text-canvas" : "border-line bg-canvas/40 text-ink-muted hover:border-ink-muted/50 hover:text-ink"}`}
          >
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && <span className={`font-mono text-[11px] ${on ? "opacity-70" : "text-ink-muted"}`}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
