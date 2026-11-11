"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * Notifications and Messages as two round icons at the top right of every page on big screens (phones keep their
 * own top bar and tabs). Each shows its unread count, live from the signed-in user.
 */
export function HeaderIcons({ className }: { className?: string }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  if (status !== "authed" || !user) return null;
  const items = [
    { href: "/notifications", label: "Notifications", icon: "bell" as const, unread: user.unreadNotifications ?? 0, on: pathname.startsWith("/notifications") },
    { href: "/messages", label: "Messages", icon: "message" as const, unread: user.unreadMessages ?? 0, on: pathname.startsWith("/messages") },
  ];
  return (
    <span className={cx("hidden shrink-0 items-center gap-1 lg:flex", className)}>
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-label={n.unread ? `${n.label}, ${n.unread} unread` : n.label}
          aria-current={n.on ? "page" : undefined}
          title={n.label}
          className={cx("relative inline-flex size-10 items-center justify-center rounded-full transition", n.on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised hover:text-ink")}
        >
          <Icon name={n.icon} size={19} />
          {n.unread > 0 && (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10.5px] leading-[18px] font-bold text-accent-ink ring-2 ring-canvas">
              {n.unread > 9 ? "9+" : n.unread}
            </span>
          )}
        </Link>
      ))}
    </span>
  );
}
