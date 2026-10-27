"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

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
    <Link key={i.label} href={i.href} aria-current={i.active ? "page" : undefined} className={cx("flex min-w-14 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-[11px] font-medium transition", i.active ? "text-ink" : "text-ink-muted")}>
      <Icon name={i.icon} size={21} className={i.active ? "text-accent-text" : ""} />
      {i.label}
    </Link>
  );

  // "Me" is your profile card (there's no profile page); signed out, it's Sign in
  const me =
    status === "authed" && user ? (
      <button type="button" onClick={() => card.openFull(user.handle)} className={cx("flex min-w-14 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-[11px] font-medium transition", pathname.startsWith("/settings") ? "text-ink" : "text-ink-muted")}>
        <Icon name="user" size={21} className={pathname.startsWith("/settings") ? "text-accent-text" : ""} />
        Me
      </button>
    ) : (
      <Link href="/login" className="flex min-w-14 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-[11px] font-medium text-ink-muted transition">
        <Icon name="user" size={21} />
        Sign in
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
