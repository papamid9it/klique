"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useRouter } from "next/navigation";
import { domainOf, inAppPath, isExternalHref } from "@/lib/links";

/**
 * "You're leaving Klique": a check before any link to another site opens. It shows where the link really goes
 * (the site, then the whole address) so a link that says one thing and goes somewhere else is easy to spot.
 * Every off-site <a> in the app goes through it (chat, posts, events, ads, profiles); links inside Klique
 * (getklique.app, www., any *.getklique.app, relative links) don't: links to its own pages open in place, with the
 * router, even when written as a full address or set to open in a new tab. A site you choose to always trust is
 * remembered on this device. Wrap something in
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
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const go = useCallback((href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  }, []);

  const leave = useCallback(
    (href: string, { newTab = true }: { newTab?: boolean } = {}) => {
      const domain = domainOf(new URL(href, window.location.href).href);
      if (!domain) return;
      const path = inAppPath(href);
      if (path) return routerRef.current.push(path); // one of our own pages: open it here
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
      const newTab = e.type === "auxclick" || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
      if (!isExternalHref(a.href)) {
        // one of our own pages written as a link (pasted in chat, a bio…): open it in place, not in a new tab or
        // a full reload. A deliberate new-tab click (middle, Ctrl/Cmd, Shift) still does what it always does.
        const path = inAppPath(a.href);
        if (path && !newTab && (a.target === "_blank" || a.origin !== window.location.origin)) {
          e.preventDefault();
          e.stopPropagation();
          routerRef.current.push(path);
        }
        return;
      }
      const domain = domainOf(a.href);
      if (!domain || isTrusted(domain)) return;
      e.preventDefault();
      e.stopPropagation();
      setAlways(false);
      setPending({ href: a.href, domain, anchor: a, newTab: newTab || a.target === "_blank" });
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
      <Modal open={!!pending} onClose={() => setPending(null)} icon={{ name: "globe" }} title="You're leaving Klique" description={pending ? `This link goes to ${pending.domain}. Klique doesn't run that site.` : undefined} size="sm">
        {pending && <LeaveBody pending={pending} always={always} onAlways={setAlways} onCancel={() => setPending(null)} onContinue={proceed} />}
      </Modal>
    </LeaveCtx.Provider>
  );
}

function LeaveBody({ pending, always, onAlways, onCancel, onContinue }: { pending: Pending; always: boolean; onAlways: (v: boolean) => void; onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-control border border-line bg-raised px-3.5 py-3">
        <p className="truncate text-[15px] font-semibold tracking-tight">{pending.domain}</p>
        <p className="mt-1 max-h-24 overflow-y-auto text-[13px] leading-relaxed break-all text-ink-muted">{pending.href}</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 px-0.5 text-sm text-ink-muted">
        <input type="checkbox" checked={always} onChange={(e) => onAlways(e.target.checked)} className="size-4 shrink-0 accent-[var(--accent-text)]" />
        <span>Don&apos;t ask again for this site on this device</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>Stay here</Button>
        <Button variant="primary" onClick={onContinue} autoFocus>
          Open site <Icon name="arrow-up-right" size={15} />
        </Button>
      </div>
    </div>
  );
}
