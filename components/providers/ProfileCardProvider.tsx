"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ProfileCard } from "@/components/domain/profile/ProfileCard";
import { ProfileModal } from "@/components/domain/profile/ProfileModal";
import { cx } from "@/components/ui/cx";

interface Ctx {
  /** The profile popout next to `anchor` (a bottom sheet on phones). Clicking the same anchor again closes it. */
  open: (handle: string, anchor?: Element | null) => void;
  /** The full profile (a wide modal; full screen on phones). There's no profile page: these two are the profile. */
  openFull: (handle: string) => void;
  close: () => void;
}

const ProfileCtx = createContext<Ctx | null>(null);

export function useProfileCard(): Ctx {
  const c = useContext(ProfileCtx);
  if (!c) throw new Error("useProfileCard must be used inside <Providers>");
  return c;
}

const CARD_W = 340;

/** A link that opens someone's full profile (on Home). Old /people/<handle> links land here too. */
export const profileHref = (handle: string) => `/?profile=${encodeURIComponent(handle)}`;
const GAP = 8;

interface Pop {
  handle: string;
  rect: { top: number; left: number; right: number; bottom: number } | null;
  sheet: boolean;
  anchor: Element | null;
}

export function ProfileCardProvider({ children }: { children: ReactNode }) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [height, setHeight] = useState(420);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setPop(null), []);
  const open = useCallback((handle: string, anchor?: Element | null) => {
    setPop((cur) => {
      if (cur && cur.handle === handle && cur.anchor === (anchor ?? null)) return null; // toggle
      const r = anchor?.getBoundingClientRect();
      return {
        handle,
        anchor: anchor ?? null,
        rect: r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom } : null,
        sheet: window.innerWidth < 640 || !r,
      };
    });
  }, []);
  const openFull = useCallback((handle: string) => {
    setPop(null);
    setFull(handle);
  }, []);
  const closeFull = useCallback(() => setFull(null), []);
  const closeAll = useCallback(() => {
    setPop(null);
    setFull(null);
  }, []);

  // The back button dismisses both (links and actions inside them close themselves).
  useEffect(() => {
    const onPop = () => {
      setPop(null);
      setFull(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const popOpen = pop !== null;
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (cardRef.current?.contains(t)) return;
      if (t.closest("[data-profile-trigger]")) return; // the trigger's own click decides (toggle / switch)
      if (t.closest("dialog")) return; // block / report dialogs opened from the card
      if (t.closest("[role=menu]")) return; // menus opened from the card (⋯, your status) sit outside it
      setPop(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    const onResize = () => setPop(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [popOpen]);

  // Track the card's real height so it can be kept on screen once its content loads.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [popOpen, pop?.sheet]);

  const value = useMemo<Ctx>(() => ({ open, openFull, close }), [open, openFull, close]);

  let style: React.CSSProperties | undefined;
  if (pop && !pop.sheet && pop.rect && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = pop.rect;
    let left = r.right + GAP;
    if (left + CARD_W > vw - GAP) left = r.left - CARD_W - GAP; // not enough room on the right: go left
    if (left < GAP) left = Math.min(Math.max(GAP, r.left), vw - CARD_W - GAP); // narrow window: line up with the trigger
    const top = Math.min(Math.max(GAP, r.top - 8), Math.max(GAP, vh - height - GAP));
    style = { left, top, width: CARD_W };
  }

  return (
    <ProfileCtx.Provider value={value}>
      {children}
      {pop && (
        <>
          {pop.sheet && <div aria-hidden="true" className="fixed inset-0 z-[70] bg-black/50" onClick={close} />}
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`@${pop.handle}`}
            style={pop.sheet ? undefined : style}
            className={cx(
              "z-[71] animate-pop overflow-y-auto border border-line bg-surface text-ink shadow-2xl",
              pop.sheet ? "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[1.25rem] pb-[env(safe-area-inset-bottom)]" : "fixed max-h-[calc(100dvh-1rem)] rounded-card",
            )}
          >
            <ProfileCard handle={pop.handle} onClose={close} onExpand={() => openFull(pop.handle)} />
          </div>
        </>
      )}
      <ProfileModal handle={full} onClose={closeFull} onOpenPerson={openFull} />
      {/* the address is only known at request time, so this listens inside its own Suspense boundary */}
      <Suspense fallback={null}>
        <CloseOnNavigate onNavigate={closeAll} />
        <OpenFromUrl onOpen={openFull} />
      </Suspense>
    </ProfileCtx.Provider>
  );
}

/** Going to another page (or another view of it, like a community's Members) closes the card and the modal. */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("profile"); // opening a profile from the address isn't moving away
  const where = `${usePathname()}?${params.toString()}`;
  const seen = useRef(where);
  useEffect(() => {
    if (seen.current === where) return;
    seen.current = where;
    onNavigate();
  }, [where, onNavigate]);
  return null;
}

/** Wrap any name / avatar / @mention: click opens the small profile card. Renders a plain button. */
export function ProfileTrigger({ handle, children, className, title, ...rest }: { handle: string; children: ReactNode; className?: string; title?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const { open } = useProfileCard();
  return (
    <button type="button" data-profile-trigger="" title={title} onClick={(e) => open(handle, e.currentTarget)} className={className} {...rest}>
      {children}
    </button>
  );
}

/** ?profile=<handle> in the address (profileHref, old profile links): open that full profile, then tidy the address. */
function OpenFromUrl({ onOpen }: { onOpen: (handle: string) => void }) {
  const handle = useSearchParams().get("profile");
  useEffect(() => {
    if (!handle) return;
    onOpen(handle);
    const url = new URL(window.location.href);
    url.searchParams.delete("profile");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [handle, onOpen]);
  return null;
}
