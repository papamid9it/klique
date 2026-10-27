"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { domainOf, isExternalHref } from "@/lib/links";

/**
 * "You're leaving Klique": a check before any link to another site opens. It shows where the link really goes
 * (the site, then the whole address) so a link that says one thing and goes somewhere else is easy to spot.
 * Every off-site <a> in the app goes through it (chat, posts, events, ads, profiles); links inside Klique
 * don't. A site you choose to always trust is remembered on this device. Wrap something in
 * `data-leave-ok` to skip the check (the admin area, our own share buttons).
 */

const KEY = "klique:trusted-sites";

function readTrusted(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function trust(domain: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...readTrusted(), domain])].slice(-200)));
  } catch {
    /* private mode or storage full: it asks again next time */
  }
}

const isTrusted = (domain: string) => readTrusted().includes(domain);

interface Pending {
  href: string;
  domain: string;
  /** the link that was clicked, clicked again on Continue so its own handlers (ad click counts) run */
  anchor: HTMLAnchorElement | null;
  newTab: boolean;
}

const LeaveCtx = createContext<{ leave: (href: string, opts?: { newTab?: boolean }) => void } | null>(null);

/** Open an off-site link from code (a button, not an <a>), with the same check. */
export function useLeave() {
  const c = useContext(LeaveCtx);
  if (!c) throw new Error("useLeave must be used inside <Providers>");
  return c.leave;
}

export function LeaveProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [always, setAlways] = useState(false);
  const approved = useRef<HTMLAnchorElement | null>(null);

  const go = useCallback((href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  }, []);

  const leave = useCallback(
    (href: string, { newTab = true }: { newTab?: boolean } = {}) => {
      const domain = domainOf(new URL(href, window.location.href).href);
      if (!domain) return;
      if (!isExternalHref(href) || isTrusted(domain)) return go(href, newTab);
      setAlways(false);
      setPending({ href, domain, anchor: null, newTab });
    },
    [go],
  );

  useEffect(() => {
    // Capture phase on the document runs before React's own handlers, so a held link never navigates or counts
    // as a click until Continue.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || (e.type === "click" && e.button !== 0) || (e.type === "auxclick" && e.button !== 1)) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || a.closest("[data-leave-ok]")) return;
      if (approved.current === a) {
        approved.current = null; // this is the Continue click going through
        return;
      }
      if (!isExternalHref(a.href)) return;
      const domain = domainOf(a.href);
      if (!domain || isTrusted(domain)) return;
      e.preventDefault();
      e.stopPropagation();
      setAlways(false);
      setPending({ href: a.href, domain, anchor: a, newTab: e.type === "auxclick" || e.ctrlKey || e.metaKey || e.shiftKey || a.target === "_blank" });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  function proceed() {
    if (!pending) return;
    if (always) trust(pending.domain);
    const { anchor, href, newTab } = pending;
    setPending(null);
    // the same link again (still in the page): its own click handlers run and it opens the way it was meant to
    if (anchor?.isConnected && (anchor.target === "_blank" || !newTab)) {
      approved.current = anchor;
      anchor.click();
    } else go(href, newTab);
  }

  return (
    <LeaveCtx.Provider value={{ leave }}>
      {children}
      <Modal open={!!pending} onClose={() => setPending(null)} title="You're leaving Klique" description="This link goes to another website. Check it's where you expect before you continue." size="sm">
        {pending && <LeaveBody pending={pending} always={always} onAlways={setAlways} onCancel={() => setPending(null)} onContinue={proceed} />}
      </Modal>
    </LeaveCtx.Provider>
  );
}

function LeaveBody({ pending, always, onAlways, onCancel, onContinue }: { pending: Pending; always: boolean; onAlways: (v: boolean) => void; onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-card border border-line bg-raised">
        <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="globe" size={20} />
          </span>
          <span className="min-w-0">
            <span className="eyebrow block">Going to</span>
            <span className="block truncate text-base font-semibold tracking-tight">{pending.domain}</span>
          </span>
        </div>
        <p className="max-h-28 overflow-y-auto px-3.5 py-2.5 font-mono text-[12px] leading-relaxed break-all text-ink-muted">{pending.href}</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={always} onChange={(e) => onAlways(e.target.checked)} className="size-4 accent-[var(--accent-text)]" />
        <span>
          Always trust <span className="font-semibold">{pending.domain}</span> on this device
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onContinue} autoFocus>
          Continue <Icon name="arrow-up-right" size={15} />
        </Button>
      </div>
    </div>
  );
}
