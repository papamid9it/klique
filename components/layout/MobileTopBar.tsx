"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "./Logo";

export function MobileTopBar() {
  const { user, status } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-1.5 border-b border-line bg-canvas/92 px-3 py-3 backdrop-blur-lg sm:gap-2 sm:px-4 lg:hidden">
      <Logo compact className="shrink-0" />
      {/* the place shrinks and truncates; the round buttons never get squeezed */}
      <span className="ml-auto flex min-w-0 justify-end">
        <ScopeButton variant="pill" className="max-w-[11rem]" />
      </span>
      <Link href="/search" aria-label="Search" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
        <Icon name="search" size={16} />
      </Link>
      {status === "authed" && (
        <Link href="/notifications" aria-label={user?.unreadNotifications ? `Notifications, ${user.unreadNotifications} unread` : "Notifications"} className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
          <Icon name="bell" size={16} />
          {!!user?.unreadNotifications && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent ring-2 ring-canvas" />}
        </Link>
      )}
      {status === "authed" && (
        <Link href="/messages" aria-label={user?.unreadMessages ? `Messages, ${user.unreadMessages} unread` : "Messages"} className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
          <Icon name="message" size={16} />
          {!!user?.unreadMessages && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent ring-2 ring-canvas" />}
        </Link>
      )}
    </header>
  );
}
