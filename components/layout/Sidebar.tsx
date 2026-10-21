"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { ScopeButton } from "@/components/domain/places/ScopeButton";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { INTERESTS, getInterest } from "@/lib/constants";
import { CommunityRail } from "./CommunityRail";
import { UserMenu } from "./UserMenu";
import { Logo } from "./Logo";
import { NAV, SCENE_DOT } from "./nav";
import { UserName } from "@/components/ui/UserName";

export function Sidebar({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { user, status } = useAuth();

  if (compact) return <SlimNav pathname={pathname} />;

  const scenes = user?.interests?.length ? user.interests : INTERESTS.slice(0, 4).map((i) => i.id);

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto no-bar [&>*]:shrink-0 border-r border-line px-6 py-7 lg:flex" aria-label="Primary">
      <Logo />

      <ScopeButton />

      <nav aria-label="Main">
        <ul className="space-y-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex h-11 items-center gap-3 rounded-control px-3.5 text-[15px] font-medium transition", active ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                >
                  <Icon name={n.icon} size={18} />
                  {n.label}
                </Link>
              </li>
            );
          })}
          {status === "authed" && (
            <li>
              <Link
                href="/messages"
                aria-current={pathname.startsWith("/messages") ? "page" : undefined}
                className={cx("flex h-11 items-center gap-3 rounded-control px-3.5 text-[15px] font-medium transition", pathname.startsWith("/messages") ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
              >
                <Icon name="message" size={18} />
                Messages
                {!!user?.unreadMessages && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-ink" aria-label={`${user.unreadMessages} unread`}>
                    {user.unreadMessages > 9 ? "9+" : user.unreadMessages}
                  </span>
                )}
              </Link>
            </li>
          )}
          {status === "authed" && (
            <li>
              <Link
                href="/notifications"
                aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
                className={cx("flex h-11 items-center gap-3 rounded-control px-3.5 text-[15px] font-medium transition", pathname.startsWith("/notifications") ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
              >
                <Icon name="bell" size={18} />
                Notifications
                {!!user?.unreadNotifications && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-ink" aria-label={`${user.unreadNotifications} unread`}>
                    {user.unreadNotifications > 9 ? "9+" : user.unreadNotifications}
                  </span>
                )}
              </Link>
            </li>
          )}

        </ul>
      </nav>

      <div>
        <p className="eyebrow mb-3 px-3.5">{user?.interests?.length ? "Your scenes" : "Popular scenes"}</p>
        <ul className="space-y-0.5">
          {scenes.map((id) => (
            <li key={id}>
              <Link href={`/communities?interest=${id}`} className="flex h-9 items-center gap-3 rounded-control px-3.5 text-sm text-ink-muted transition hover:bg-raised/60 hover:text-ink">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SCENE_DOT[id] }} />
                {getInterest(id).name}
              </Link>
            </li>
          ))}
          {status === "authed" && (
            <li>
              <Link href="/settings#profile" className="flex h-9 items-center gap-3 rounded-control px-3.5 text-sm text-ink-muted/80 transition hover:text-ink">
                <Icon name="plus" size={13} />
                Add an interest
              </Link>
            </li>
          )}
        </ul>
      </div>

      <div className="mt-auto space-y-2">
        {status === "authed" && user ? (
          <div className="flex items-center gap-1 rounded-card border border-line bg-surface p-2">
            <Link href={`/people/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-control p-1.5 hover:bg-raised">
              <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink"><UserName name={user.displayName} effect={user.nameEffect} /></span>
                <span className="block truncate font-mono text-[11px] text-ink-muted">@{user.handle}</span>
              </span>
            </Link>
            <UserMenu
              align="right"
              trigger={({ open, props }) => (
                <button {...props} aria-label="Account menu" title="Settings, ads and more" className={cx("inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink", open && "bg-raised text-ink")}>
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

/** Icon-only nav used beside the community chat workspace (like Discord's server rail). */
function SlimNav({ pathname }: { pathname: string }) {
  const { user, status } = useAuth();
  const activeSlug = /^\/communities\/([^/]+)/.exec(pathname)?.[1] ?? null;
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col items-center border-r border-line lg:flex" aria-label="Primary">
      {/* the home button sits on its own above the scrolling part, so nothing ever passes behind it */}
      <div className="flex w-full shrink-0 flex-col items-center gap-3 pt-4 pb-3">
        <Link href="/" aria-label="klique — home" className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3.5v17M4.6 7.8l14.8 8.4M4.6 16.2 19.4 7.8" />
          </svg>
        </Link>
        <span aria-hidden="true" className="h-px w-8 bg-line" />
      </div>
      <div className="no-bar flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto pb-4 [&>*]:shrink-0">
      <nav aria-label="Main">
        <ul className="space-y-1.5">
          {/* no Discover icon here: the klique logo above already goes home */}
          {NAV.filter((n) => n.href !== "/").map((n) => {
            const active = n.match(pathname);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  title={n.label}
                  aria-label={n.label}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex size-11 items-center justify-center rounded-control transition", active ? "bg-raised text-accent-text" : "text-ink-muted hover:bg-raised/60 hover:text-ink")}
                >
                  <Icon name={n.icon} size={20} />
                </Link>
              </li>
            );
          })}
          {status === "authed" && (
            <li>
              <Link href="/messages" title="Messages" aria-label={user?.unreadMessages ? `Messages, ${user.unreadMessages} unread` : "Messages"} className="relative flex size-11 items-center justify-center rounded-control text-ink-muted transition hover:bg-raised/60 hover:text-ink">
                <Icon name="message" size={20} />
                {!!user?.unreadMessages && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-accent ring-2 ring-canvas" />}
              </Link>
            </li>
          )}
          {status === "authed" && (
            <li>
              <Link href="/notifications" title="Notifications" aria-label={user?.unreadNotifications ? `Notifications, ${user.unreadNotifications} unread` : "Notifications"} className={cx("relative flex size-11 items-center justify-center rounded-control transition hover:bg-raised/60 hover:text-ink", pathname.startsWith("/notifications") ? "bg-raised text-accent-text" : "text-ink-muted")}>
                <Icon name="bell" size={20} />
                {!!user?.unreadNotifications && (
                  <span className="absolute top-1 right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-canvas">
                    {user.unreadNotifications > 9 ? "9+" : user.unreadNotifications}
                  </span>
                )}
              </Link>
            </li>
          )}
        </ul>
      </nav>
      <span aria-hidden="true" className="h-px w-8 bg-line" />
      <CommunityRail activeSlug={activeSlug} />
      <div className="mt-auto flex flex-col items-center gap-2">
        {status === "authed" && user ? (
          <>
            <UserMenu
              trigger={({ props }) => (
                <button {...props} title={`${user.displayName}: profile, settings, ads`} aria-label="Account menu" className="rounded-full">
                  <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={38} />
                </button>
              )}
            />
          </>
        ) : status === "anon" ? (
          <Link href="/login" className="rounded-control bg-accent px-2.5 py-2 text-[11px] font-bold text-accent-ink">
            Sign in
          </Link>
        ) : null}
      </div>
      </div>
    </aside>
  );
}
