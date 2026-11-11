"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PresenceDot } from "@/components/domain/profile/ProfileParts";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { HeaderIcons } from "./HeaderIcons";
import { Logo } from "./Logo";
import { HOME_NAV } from "./nav";
import { UserMenu } from "./UserMenu";

/**
 * The header panel of Communities home on big screens ("floating panels"): the wordmark and the main pages in one
 * pill, search (Ctrl K), Messages and Notifications, and your profile (its menu). Phones keep their own top bar.
 */
export function DeckHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status } = useAuth();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Ctrl K (⌘K on a Mac) jumps to search, like other desktop apps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="hidden shrink-0 items-center gap-3 rounded-[18px] border border-line bg-surface px-3.5 py-2.5 lg:flex">
      <Logo height={30} className="pr-2" />
      <nav aria-label="Main" className="flex items-center gap-1 rounded-xl bg-canvas p-1">
        {HOME_NAV.map((n) => {
          const on = n.match(pathname);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cx("inline-flex h-9 items-center rounded-[9px] px-3.5 text-[13px] font-semibold transition", on ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}>
              {n.href === "/" ? "Home" : n.label}
            </Link>
          );
        })}
      </nav>
      <form
        role="search"
        className="ml-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor="deck-search" className="sr-only">
          Search Klique
        </label>
        <span className="flex h-11 w-[min(340px,30vw)] items-center gap-2 rounded-[12px] border border-line bg-canvas px-3.5 focus-within:border-accent-text">
          <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
          <input ref={input} id="deck-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Klique" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted/80" />
          <kbd className="shrink-0 font-mono text-[10px] tracking-wider text-ink-muted">CTRL K</kbd>
        </span>
      </form>
      <HeaderIcons square />
      {status === "authed" && user && (
        <UserMenu
          align="right"
          trigger={({ props }) => (
            <button {...props} title={`${user.displayName}: profile, settings, ads`} aria-label="Account menu" className="relative rounded-[12px]">
              <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={40} className="!rounded-[12px]" />
              <PresenceDot presence={user.presence} self className="-right-0.5 -bottom-0.5 size-3 ring-2" />
            </button>
          )}
        />
      )}
    </header>
  );
}
