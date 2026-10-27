"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/** icons only (their names are the labels for screen readers): a big tap target each */
const TAB = "flex h-12 min-w-14 items-center justify-center rounded-control px-3 transition active:bg-raised";

export function MobileNav() {
  const pathname = usePathname();
  const { user, status } = useAuth();

  const card = useProfileCard();
  const items = [
    { href: "/", label: "Discover", icon: "home" as const, active: pathname === "/" },
    { href: "/events", label: "Events", icon: "calendar" as const, active: pathname.startsWith("/events") },
    { href: "/communities", label: "Communities", icon: "users" as const, active: pathname === "/communities" || pathname.startsWith("/search") },
    { href: "/saved", label: "Saved", icon: "bookmark" as const, active: pathname.startsWith("/saved") },
  ];

  const link = (i: (typeof items)[number]) => (
    <Link key={i.label} href={i.href} aria-label={i.label} title={i.label} aria-current={i.active ? "page" : undefined} className={cx(TAB, i.active ? "text-ink" : "text-ink-muted")}>
      <Icon name={i.icon} size={26} className={i.active ? "text-accent-text" : ""} />
    </Link>
  );

  // "Me" is your profile card (there's no profile page); signed out, it's Sign in
  const me =
    status === "authed" && user ? (
      <button type="button" onClick={() => card.openFull(user.handle)} aria-label="Me" title="Me" className={cx(TAB, pathname.startsWith("/settings") ? "text-ink" : "text-ink-muted")}>
        <Icon name="user" size={26} className={pathname.startsWith("/settings") ? "text-accent-text" : ""} />
      </button>
    ) : (
      <Link href="/login" aria-label="Sign in" title="Sign in" className={cx(TAB, "text-ink-muted")}>
        <Icon name="user" size={26} />
      </Link>
    );

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {items.map(link)}
        {me}
      </div>
    </nav>
  );
}
