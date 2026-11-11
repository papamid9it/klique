"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { HeaderIcons } from "./HeaderIcons";
import { Logo } from "./Logo";
import { HOME_NAV } from "./nav";

/**
 * The top bar of Communities home on big screens (the "command deck"): the wordmark and the main pages as one pill
 * on the left; search (Ctrl K) and Messages / Notifications on the right. Phones keep their own top bar.
 */
export function DeckHeader() {
  const pathname = usePathname();
  const router = useRouter();
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
    <header className="sticky top-0 z-30 hidden h-16 items-center gap-5 border-b border-line bg-canvas/92 px-7 backdrop-blur-lg lg:flex">
      <Logo height={30} />
      <nav aria-label="Main" className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
        {HOME_NAV.map((n) => {
          const on = n.match(pathname);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={cx("inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition", on ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink")}>
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
          Search events, communities, people
        </label>
        <span className="flex h-10 w-[min(360px,32vw)] items-center gap-2 rounded-control border border-line bg-surface px-3 focus-within:border-accent-text">
          <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
          <input ref={input} id="deck-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, communities, people" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted/80" />
          <kbd className="shrink-0 font-mono text-[10px] tracking-wider text-ink-muted">CTRL K</kbd>
        </span>
      </form>
      <HeaderIcons />
    </header>
  );
}
