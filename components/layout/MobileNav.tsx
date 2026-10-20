"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

export function MobileNav() {
  const pathname = usePathname();
  const { user, status } = useAuth();

  const items = [
    { href: "/", label: "Discover", icon: "home" as const, active: pathname === "/" || pathname.startsWith("/search") },
    { href: "/events", label: "Events", icon: "calendar" as const, active: pathname.startsWith("/events") },
    { href: "/communities", label: "Communities", icon: "users" as const, active: pathname.startsWith("/communities") },
    {
      href: status === "authed" && user ? `/people/${user.handle}` : "/login",
      label: status === "authed" ? "Me" : "Sign in",
      icon: "user" as const,
      active: pathname.startsWith("/people") || pathname.startsWith("/settings") || pathname.startsWith("/saved"),
    },
  ];

  const link = (i: (typeof items)[number]) => (
    <Link key={i.label} href={i.href} aria-current={i.active ? "page" : undefined} className={cx("flex min-w-16 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-[11px] font-medium transition", i.active ? "text-ink" : "text-ink-muted")}>
      <Icon name={i.icon} size={21} className={i.active ? "text-accent-text" : ""} />
      {i.label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {link(items[0])}
        {link(items[1])}
        {link(items[2])}
        {link(items[3])}
      </div>
    </nav>
  );
}
