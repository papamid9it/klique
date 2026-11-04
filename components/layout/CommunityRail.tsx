"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { softNavigate } from "@/lib/nav";
import { useEffect } from "react";
import { CommunityService } from "@/app/services/CommunityService";
import { useAuth } from "@/components/providers/AuthProvider";
import { SpaceService } from "@/app/services/SpaceService";
import { errorMessage } from "@/app/ApiCore";
import { absoluteUrl } from "@/components/domain/ShareButton";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ContextMenu, type MenuEntry } from "@/components/ui/Dropdown";
import { usePins } from "@/lib/hooks/usePins";
import { KLIQUE_SLUG } from "@/lib/constants";
import { CountBadge } from "@/components/ui/CountBadge";
import { useAppEvent } from "@/lib/appEvents";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { useRealtime, useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useApi } from "@/lib/hooks/useApi";
import type { MyCommunityDTO } from "@/lib/types";
import { prefetchCommunity } from "./prefetchCommunity";

/**
 * Your communities, one tile each, so you can hop between them without going back to a list.
 * Shows an unread dot and an @mention count; the active one turns from a circle into a rounded square.
 * `horizontal` is the compact strip used inside the mobile drawer.
 */
export function CommunityRail({ activeSlug, horizontal, onNavigate }: { activeSlug: string | null; horizontal?: boolean; onNavigate?: () => void }) {
  const { status, user } = useAuth();
  const authed = status === "authed";
  const { data, loading, reload } = useApi(authed ? () => CommunityService.mine() : null, [authed, user?.id], { key: "my-communities" });

  const pathname = usePathname();
  // already in a community: switching to another one stays in the browser (everything it needs is preloaded)
  const inWorkspace = /^\/communities\/(?!new$)[^/]+$/.test(pathname);

  const pins = usePins("communities");
  const toast = useToast();
  const confirm = useConfirm();
  const { connected } = useRealtime();
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), connected ? 180_000 : 60_000);
    return () => clearInterval(t);
  }, [authed, reload, connected]);
  // activity in any of your communities: refresh the unread dots
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "channel" || (e.type === "crew" && !!e.chat), debounceMs: 1500 });
  // you joined or left one in this tab: its icon appears or goes at once
  useAppEvent("membership", () => void reload());
  // you were let into a community (or added to a group): its icon appears
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "community", debounceMs: 500 });


  if (status === "loading" || (authed && loading && !data)) {
    // Same tile + label shape as the real thing, so nothing jumps when it loads.
    return (
      <nav aria-label="Your communities" aria-busy="true" className={horizontal ? "border-b border-line px-3 py-3" : "w-full"}>
        <ul className={horizontal ? "flex gap-2 overflow-hidden" : "flex w-full flex-col items-center gap-2.5"}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={cx("flex flex-col items-center gap-1", horizontal ? "w-14 shrink-0" : "w-full")}>
              <span className={cx("skeleton block rounded-full", horizontal ? "size-11" : "size-14")} aria-hidden="true" />
              {horizontal && <span className="skeleton block h-2 w-10 rounded" aria-hidden="true" />}
            </li>
          ))}
          <li className={cx("flex justify-center", horizontal ? "shrink-0 self-start" : "w-full")}>
            <span className={cx("skeleton block rounded-full", horizontal ? "size-11" : "size-14")} aria-hidden="true" />
          </li>
        </ul>
      </nav>
    );
  }
  if (!authed) return null;
  const items: MyCommunityDTO[] = pins.first(data ?? []);
  const refresh = () => void reload();
  const failed = (e: unknown) => toast(errorMessage(e), "error");
  const copyLink = (link: string, done: string) => void navigator.clipboard.writeText(absoluteUrl(link)).then(() => toast(done, "success"), failed);
  const menuFor = (c: MyCommunityDTO): MenuEntry[] => {
    const link = `/communities/${c.slug}`;
    const manages = c.role === "owner" || c.role === "admin";
    return [
      { label: "Mark as read", icon: "check", disabled: !c.unread && !c.unreadCount && !c.mentions, onSelect: () => void CommunityService.markRead(c.slug).then(refresh, failed) },
      { label: "Invite people", icon: "userplus", onSelect: () => (c.privacy === "private" && manages ? softNavigate(`${link}?settings=invites`) : copyLink(link, "Community link copied. Send it to invite them.")) },
      { label: pins.has(c.id) ? "Unpin from top" : "Pin to top", icon: "pin", onSelect: () => pins.toggle(c.id) },
      { label: "Copy link", icon: "link", onSelect: () => copyLink(link, "Link copied") },
      { type: "sep" },
      {
        label: c.muted ? "Unmute community" : "Mute community",
        icon: "bell",
        onSelect: () =>
          void CommunityService.setMuted(c.slug, !c.muted).then(() => {
            toast(c.muted ? `${c.name} unmuted` : `${c.name} muted`, "success");
            refresh();
          }, failed),
      },
      ...(manages ? ([{ label: "Community settings", icon: "sliders", onSelect: () => softNavigate(`${link}?settings=overview`) }] as MenuEntry[]) : []),
      ...(c.role !== "owner" && c.slug !== KLIQUE_SLUG
        ? ([
            { type: "sep" },
            {
              label: "Leave community",
              icon: "logout",
              danger: true,
              onSelect: async () => {
                if (await confirm({ title: `Leave ${c.name}?`, body: "You can join again later." })) await SpaceService.leave(c.slug).then(refresh, failed);
              },
            },
          ] as MenuEntry[])
        : []),
    ];
  };

  const tiles = items.map((c) => {
    const active = c.slug === activeSlug;
    return (
      <li key={c.id} className={cx("relative", horizontal ? "shrink-0" : "w-full")}>
        <ContextMenu items={menuFor(c)} label={`${c.name} options`}>
        <Link
          href={`/communities/${c.slug}`}
          onClick={(e) => {
            onNavigate?.();
            if (!inWorkspace || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            if (!active || window.location.search) softNavigate(`/communities/${c.slug}`);
          }}
          // pointing at it is a strong hint: load it now if the background pass hasn't yet
          onPointerEnter={() => void prefetchCommunity(c.slug)}
          onFocus={() => void prefetchCommunity(c.slug)}
          onTouchStart={() => void prefetchCommunity(c.slug)}
          title={c.name}
          aria-label={`${c.name}${c.unreadCount ? `, ${c.unreadCount} unread` : c.unread ? ", unread messages" : ""}${c.mentions ? `, ${c.mentions} mention you` : ""}`}
          aria-current={active ? "page" : undefined}
          className={cx("group flex flex-col items-center gap-1", horizontal ? "w-14" : "w-full")}
        >
          <span className={cx("relative block overflow-hidden transition-[border-radius,box-shadow]", horizontal ? "size-11" : "size-14", active ? "rounded-[14px]" : "rounded-full group-hover:rounded-[14px]")}>
            <Cover src={c.coverImage} seed={c.id} interest={c.interest} className={cx("size-full", c.muted && "opacity-50")} />
          </span>
          {/* how many unseen messages (channels and your crews' chats); red when some mention you */}
          {(c.unreadCount ?? 0) > 0 || c.mentions > 0 ? (
            <CountBadge n={Math.max(c.unreadCount ?? 0, c.mentions)} mention={c.mentions > 0} className="absolute top-0 right-1 ring-2 ring-canvas" label="" />
          ) : (
            c.unread && <span className="absolute top-0 right-1 size-3 rounded-full bg-accent ring-2 ring-canvas" aria-hidden="true" />
          )}
          {horizontal && <span className={cx("w-full truncate px-1 text-center text-[10px] leading-tight", active ? "font-semibold text-ink" : "text-ink-muted group-hover:text-ink")}>{c.name}</span>}
        </Link>
        </ContextMenu>
      </li>
    );
  });

  const add = (
    <li className={cx("flex justify-center", horizontal ? "shrink-0 self-start" : "w-full")}>
      <Link href="/communities" onClick={onNavigate} title="Find communities" aria-label="Find communities" className={cx("flex items-center justify-center rounded-full border border-dashed border-line text-ink-muted transition hover:border-ink hover:text-ink", horizontal ? "size-11" : "size-14")}>
        <Icon name="plus" size={18} />
      </Link>
    </li>
  );

  return (
    <nav aria-label="Your communities" className={horizontal ? "border-b border-line px-3 py-3" : "w-full"}>
      <ul className={horizontal ? "flex gap-2 overflow-x-auto no-bar" : "flex w-full flex-col items-center gap-2.5"}>
        {tiles}
        {add}
      </ul>
    </nav>
  );
}
