"use client";

import Link from "next/link";
import { usePagePath } from "@/lib/nav";
import { CommunityService } from "@/app/services/CommunityService";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CountBadge } from "@/components/ui/CountBadge";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { Logo } from "./Logo";
import { HOME_NAV } from "./nav";
import { PanelSlot, hasPagePanel } from "./PagePanel";
import { prefetchCommunity } from "./prefetchCommunity";
import { UserMenu } from "./UserMenu";
import { PresenceDot } from "@/components/domain/profile/ProfileParts";

const row = "flex h-11 items-center gap-3 rounded-control px-3.5 text-[15px] font-medium transition";
/** The panel's middle: scrolls on its own, fading out at its top and bottom edges. */
const SCROLL = "min-h-0 flex-1 overflow-y-auto px-5 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_14px,black_calc(100%-18px),transparent)]";

/**
 * The left panel on Home and the other top-level pages: the logo, search, place, the main nav (Discover = Home,
 * Events, Messages, Notifications, Communities), your communities and your account. Pages with sections of their
 * own (Communities, Saved, Notifications, Events) put those in its place instead (PagePanel), starting with Home.
 * Inside a community the icon rail and the community's own panel take over.
 */
export function HomePanel() {
  const pathname = usePagePath();
  const { user, status } = useAuth();
  const card = useProfileCard();
  const own = hasPagePanel(pathname);

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line lg:flex" aria-label="Primary">
      <div className="shrink-0 px-6 pt-8 pb-6">
        <Logo height={54} />
      </div>
      {own ? (
        // the page's own sections scroll between the logo and your account
        <div className={SCROLL}>
          <PanelSlot />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-6 px-5 pb-5">
          <div className="space-y-2">
            {/* on Home the right-hand column has the search box (wide screens), so this one steps aside there */}
            <Link href="/search" className={cx("flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-[13px] text-ink-muted transition hover:text-ink", pathname === "/" && "xl:hidden")}>
              <Icon name="search" size={14} /> Search scenes, people, events
            </Link>
            <ScopeButton />
          </div>
          <nav aria-label="Main">
            <ul className="space-y-1">
              {HOME_NAV.filter((n) => !n.authed || status === "authed").map((n) => {
                const on = n.match(pathname);
                const unread = n.href === "/messages" ? user?.unreadMessages : n.href === "/notifications" ? user?.unreadNotifications : undefined;
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={on ? "page" : undefined} className={cx(row, on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}>
                      <Icon name={n.icon} size={18} />
                      {n.label}
                      {!!unread && (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-ink" aria-label={`${unread} unread`}>
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          </div>
          {/* your communities scroll on their own, so the account footer never moves */}
          <div className={SCROLL}>{status === "authed" && <MyCommunities />}</div>
        </>
      )}

      <div className="shrink-0 border-t border-line bg-surface/60 px-3 py-3">
        {status === "authed" && user ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => card.openFull(user.handle)} aria-label="Your profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-control p-1.5 text-left transition hover:bg-raised">
              <span className="relative shrink-0">
                <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={38} />
                <PresenceDot presence={user.presence} self className="right-0 bottom-0 size-3 ring-2" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  <UserName name={user.displayName} effect={user.nameEffect} />
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-muted">@{user.handle}</span>
              </span>
            </button>
            <UserMenu
              align="right"
              trigger={({ open, props }) => (
                <button {...props} aria-label="Account menu" title="Settings, saved, ads and more" className={cx("inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink", open && "bg-raised text-ink")}>
                  <Icon name="more" size={18} />
                </button>
              )}
            />
          </div>
        ) : status === "anon" ? (
          <div className="space-y-2">
            <Button href="/signup" variant="primary" className="w-full">
              Join klique
            </Button>
            <Button href="/login" variant="secondary" className="w-full">
              Sign in
            </Button>
          </div>
        ) : (
          <div className="skeleton h-14" aria-hidden="true" />
        )}
      </div>
    </aside>
  );
}

/** Your communities under the main nav: picture, name, unread count; + starts a new one. */
function MyCommunities() {
  const { user } = useAuth();
  const mine = useApi(() => CommunityService.mine(), [user?.id], { key: "my-communities" });
  const list = mine.data ?? [];
  return (
    <section aria-labelledby="panel-mine">
      <div className="mb-1.5 flex items-center justify-between px-3.5">
        <h2 id="panel-mine" className="eyebrow">
          My communities
        </h2>
        <Link href="/communities/new" aria-label="Start a community" title="Start a community" className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name="plus" size={14} />
        </Link>
      </div>
      {mine.loading && !list.length ? (
        <div className="space-y-1.5 px-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-9" />
          ))}
        </div>
      ) : list.length ? (
        <ul className="space-y-0.5">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/communities/${c.slug}`} onPointerEnter={() => void prefetchCommunity(c.slug)} onFocus={() => void prefetchCommunity(c.slug)} className="flex items-center gap-2.5 rounded-control px-2 py-1.5 transition hover:bg-raised/60">
                <span className="relative block size-8 shrink-0 overflow-hidden rounded-[10px]">
                  <Cover src={c.coverImage} seed={c.id} interest={c.interest} className="size-full" />
                </span>
                <span className={cx("min-w-0 flex-1 truncate text-[13.5px]", c.unread ? "font-semibold text-ink" : "font-medium text-ink-muted")}>{c.name}</span>
                <CountBadge n={Math.max(c.unreadCount ?? 0, c.mentions)} mention={c.mentions > 0} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 text-[13px] text-ink-muted">
          None yet.{" "}
          <Link href="/communities" className="font-semibold text-accent-text hover:underline">
            Find some
          </Link>
        </p>
      )}
    </section>
  );
}
