"use client";

import Link from "next/link";
import { useState } from "react";
import { usePagePath } from "@/lib/nav";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { AccountSheet } from "./AccountSheet";

/** a big tap target each, icon over a short label */
const TAB = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-1 pt-1 text-[10.5px] leading-tight font-medium transition active:bg-raised";

/**
 * Phones: the bottom bar. Home, Events, Kliques, Communities, and Me (your picture): Me opens the account menu as a
 * sheet (status, profile, Saved, plan, settings, admin, sign out). Messages, notifications and search are in the
 * top bar; Saved is in the Communities panel and the account menu.
 */
export function MobileNav() {
  const pathname = usePagePath();
  const { user, status } = useAuth();
  const [me, setMe] = useState(false);
  const items = [
    { href: "/", label: "Home", icon: "home" as const, active: pathname === "/" },
    { href: "/events", label: "Events", icon: "calendar" as const, active: pathname.startsWith("/events") },
    { href: "/kliques", label: "Kliques", icon: "pin" as const, active: pathname.startsWith("/kliques") },
    { href: "/communities", label: "Communities", icon: "users" as const, active: pathname === "/communities" || pathname.startsWith("/search") || pathname.startsWith("/saved") },
  ];

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 py-1">
          {items.map((i) => (
            <Link key={i.label} href={i.href} aria-current={i.active ? "page" : undefined} className={cx(TAB, i.active ? "text-ink" : "text-ink-muted")}>
              <Icon name={i.icon} size={24} className={i.active ? "text-accent-text" : ""} />
              <span className="truncate">{i.label}</span>
            </Link>
          ))}
          {status === "authed" && user ? (
            <button type="button" onClick={() => setMe(true)} aria-haspopup="dialog" aria-expanded={me} className={cx(TAB, pathname.startsWith("/settings") || me ? "text-ink" : "text-ink-muted")}>
              <span className={cx("rounded-full", (pathname.startsWith("/settings") || me) && "ring-2 ring-accent-text ring-offset-2 ring-offset-canvas")}>
                <Avatar name={user.displayName} src={user.avatarUrl} size={24} />
              </span>
              <span className="truncate">Me</span>
            </button>
          ) : (
            <Link href="/login" className={cx(TAB, "text-ink-muted")}>
              <Icon name="user" size={24} />
              <span className="truncate">Sign in</span>
            </Link>
          )}
        </div>
      </nav>
      <AccountSheet open={me} onClose={() => setMe(false)} />
    </>
  );
}
