"use client";

import { PROFILE_DESIGNS_ENABLED } from "@/lib/constants";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AdminService } from "@/app/services/AdminService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SlideOver } from "@/components/ui/SlideOver";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { AdminSummaryDTO } from "@/lib/types";

/* The admin console: a full-screen surface with its own menu (like Settings), for site admins only. */

type Item = { href: string; label: string; icon: IconName; count?: (s: AdminSummaryDTO) => number };
const MENU: { title: string | null; items: Item[] }[] = [
  { title: null, items: [{ href: "/admin", label: "Overview", icon: "home" }] },
  {
    title: "Moderation",
    items: [
      { href: "/admin/reports", label: "Reports", icon: "flag", count: (s) => s.reports.open },
      { href: "/admin/inbox", label: "Event finder", icon: "ticket", count: (s) => s.pendingDrafts },
    ],
  },
  {
    title: "Directory",
    items: [
      { href: "/admin/people", label: "People", icon: "users" },
      { href: "/admin/events", label: "Events", icon: "calendar" },
      { href: "/admin/communities", label: "Communities", icon: "hash" },
      { href: "/admin/categories", label: "Categories", icon: "folder" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/admin/ads", label: "Ads", icon: "megaphone", count: (s) => s.pendingAds },
      { href: "/admin/plans", label: "Plans", icon: "ticket" },
      { href: "/admin/points", label: "Points", icon: "coin" },
      // profile designs are off for now (lib/constants PROFILE_DESIGNS_ENABLED)
      ...(PROFILE_DESIGNS_ENABLED ? [{ href: "/admin/effects", label: "Profile effects", icon: "asterisk" as const }] : []),
      { href: "/admin/payouts", label: "Payouts", icon: "ticket", count: (s) => s.pendingPayouts },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: "clock" },
      { href: "/admin/system", label: "System", icon: "sliders" },
    ],
  },
];

const AdminCtx = createContext<{ summary: AdminSummaryDTO | null; refresh: () => void }>({ summary: null, refresh: () => {} });
/** Menu counts, and a way to refresh them after acting on something. */
export const useAdmin = () => useContext(AdminCtx);

const isActive = (path: string, href: string) => (href === "/admin" ? path === "/admin" || path === "/admin/" : path.startsWith(href));

function Menu({ summary, onNavigate }: { summary: AdminSummaryDTO | null; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-5">
      {MENU.map((g, i) => (
        <div key={i}>
          {g.title && <p className="eyebrow mb-1.5 px-3">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const on = isActive(path, it.href);
              const n = summary && it.count ? it.count(summary) : 0;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cx("flex h-9 items-center gap-3 rounded-control px-3 text-sm transition", on ? "bg-raised font-semibold text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                  >
                    <Icon name={it.icon} size={16} />
                    <span className="flex-1">{it.label}</span>
                    {n > 0 && <span className="min-w-5 rounded-full bg-accent px-1.5 text-center font-mono text-[11px] leading-5 font-semibold text-accent-ink">{n > 99 ? "99+" : n}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5">
      <span className="inline-flex size-8 items-center justify-center rounded-control bg-ink text-canvas">
        <Icon name="shield" size={16} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">klique. admin</span>
        <span className="block font-mono text-[10px] tracking-wide text-ink-muted uppercase">Console</span>
      </span>
    </Link>
  );
}

function Console({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: summary, reload } = useApi(() => AdminService.summary(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const refresh = useCallback(() => void reload(), [reload]);

  return (
    <AdminCtx.Provider value={{ summary, refresh }}>
      <div data-leave-ok className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/40 px-3 py-5 lg:flex">
          <div className="px-2">
            <Brand />
          </div>
          <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
            <Menu summary={summary} />
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {user && (
              <div className="flex items-center gap-2.5 px-2">
                <Avatar name={user.displayName} src={user.avatarUrl} size={30} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{user.displayName}</p>
                  <p className="truncate font-mono text-[11px] text-ink-muted">{user.email}</p>
                </div>
              </div>
            )}
            <Link href="/" className="flex h-9 items-center gap-3 rounded-control px-3 text-sm text-ink-muted hover:bg-raised/60 hover:text-ink">
              <Icon name="logout" size={16} /> Back to Klique
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
            <Brand />
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open admin menu" className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-raised">
              <Icon name="menu" size={20} />
            </button>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-24 sm:px-8 lg:px-10 lg:pt-10">
            {children}
          </main>
        </div>
      </div>
      <SlideOver open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="Admin menu">
        <div className="p-4 pt-5">
          <Brand />
          <div className="mt-6">
            <Menu summary={summary} onNavigate={() => setMenuOpen(false)} />
          </div>
          <Link href="/" className="mt-6 flex h-9 items-center gap-3 rounded-control border-t border-line px-3 pt-4 text-sm text-ink-muted hover:text-ink">
            <Icon name="logout" size={16} /> Back to Klique
          </Link>
        </div>
      </SlideOver>
    </AdminCtx.Provider>
  );
}

/**
 * The layout always renders its page (so Next.js can validate every admin route); the console chrome only
 * appears for admins, and each page guards its own content with <AdminGate>.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const phone = usePhoneWidth();
  const [anyway, setAnyway] = useState(() => {
    try {
      return sessionStorage.getItem("klique:admin-on-phone") === "1";
    } catch {
      return false;
    }
  });
  // a phone: the console is built for a computer, so ask first (once per visit)
  if (status === "authed" && user?.isAdmin && phone && !anyway) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-raised">
          <Icon name="shield" size={26} />
        </span>
        <h1 className="text-xl font-semibold">Admin works best on a computer</h1>
        <p className="text-sm text-ink-muted">The console has wide tables and lots of tools. You can still use it here, it&apos;s just roomier on a bigger screen.</p>
        <div className="flex w-full flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => {
              try {
                sessionStorage.setItem("klique:admin-on-phone", "1");
              } catch {
                /* private mode: it just asks again next time */
              }
              setAnyway(true);
            }}
          >
            Continue anyway
          </Button>
          <Button href="/">Back to Klique</Button>
        </div>
      </div>
    );
  }
  if (status === "authed" && user?.isAdmin) return <Console>{children}</Console>;
  return <>{children}</>;
}

/** True on a phone-width screen (under 640px), after the first render. */
function usePhoneWidth(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Shows the page only to site admins; everyone else gets a loading state, a sign-in prompt or "Admins only". */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, user, requireAuth } = useAuth();
  if (status === "authed" && user?.isAdmin) return <>{children}</>;
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-10 sm:px-8">
        <Skeleton className="h-10 w-56 rounded-control" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <div className="w-full">
        <EmptyState
          icon="lock"
          title={status === "anon" ? "Sign in first" : "Admins only"}
          action={
            status === "anon" ? (
              <Button variant="primary" onClick={() => requireAuth()}>
                Sign in
              </Button>
            ) : (
              <Button href="/">Back to Klique</Button>
            )
          }
        >
          {status === "anon" ? "The admin console is for Klique's site admins." : "This page is for Klique's site admins."}
        </EmptyState>
      </div>
    </div>
  );
}
