"use client";

import Link from "next/link";
import { CrewService } from "@/app/services/CrewService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";

/**
 * Going out's two halves (as in the app): Events | Kliques, the one you're on filled. Kliques shows how many of
 * yours have new messages.
 */
export function GoingOutTabs({ current, className }: { current: "events" | "kliques"; className?: string }) {
  const { status } = useAuth();
  const joined = useApi(status === "authed" ? () => CrewService.joined() : null, [status], { key: "kliques-joined" });
  const unread = (joined.data ?? []).filter((k) => (k.unreadCount ?? 0) > 0).length;
  const tab = (id: "events" | "kliques") => {
    const on = current === id;
    return (
      <Link
        href={id === "events" ? "/events" : "/kliques"}
        role="tab"
        aria-selected={on}
        aria-current={on ? "page" : undefined}
        className={cx("flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] text-[15px] transition", on ? "bg-ink font-bold text-canvas" : "font-semibold text-ink-muted hover:text-ink")}
      >
        <Icon name={id === "events" ? "calendar" : "users"} size={17} />
        {id === "events" ? "Events" : "Kliques"}
        {id === "kliques" && unread > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </Link>
    );
  };
  return (
    <div className={className}>
      <p className="eyebrow mb-2">Going out</p>
      <div role="tablist" aria-label="Going out" className="flex max-w-sm gap-1 rounded-control border border-line bg-surface p-1">
        {tab("events")}
        {tab("kliques")}
      </div>
    </div>
  );
}
