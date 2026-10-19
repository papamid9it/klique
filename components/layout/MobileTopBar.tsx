"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "./Logo";

export function MobileTopBar() {
  const { user, status } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/92 px-4 py-3 backdrop-blur-lg lg:hidden">
      <Logo />
      <ScopeButton variant="pill" className="ml-auto" />
      <Link href="/search" aria-label="Search" className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface">
        <Icon name="search" size={16} />
      </Link>
      {status === "authed" && (
        <Link href="/messages" aria-label={user?.unreadMessages ? `Messages, ${user.unreadMessages} unread` : "Messages"} className="relative inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface">
          <Icon name="message" size={16} />
          {!!user?.unreadMessages && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent ring-2 ring-canvas" />}
        </Link>
      )}
    </header>
  );
}
