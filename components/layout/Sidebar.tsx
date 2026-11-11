"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { CommunityRail } from "./CommunityRail";
import { LogoMark } from "./Logo";
import { HOME_NAV } from "./nav";
import { Icon } from "@/components/ui/Icon";
import { UserMenu } from "./UserMenu";
import { PresenceDot } from "@/components/domain/profile/ProfileParts";

/** The icon rail inside a community, a crew chat and Messages; other pages have the home panel (HomePanel). */
export function Sidebar({ withNav }: { /** also the main pages as icons (Communities home, where there's no home panel) */ withNav?: boolean } = {}) {
  return <SlimNav pathname={usePathname()} withNav={withNav} />;
}

/**
 * Icon rail beside the community chat workspace, a crew's chat and Messages (like Discord's server rail): Home (the
 * logo, fixed at the top), your communities, then your account. Events, Messages, Notifications and the rest are
 * in the home panel, one click away through Home.
 */
function SlimNav({ pathname, withNav }: { pathname: string; withNav?: boolean }) {
  const { user, status } = useAuth();
  const activeSlug = /^\/communities\/([^/]+)/.exec(pathname)?.[1] ?? null;
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col items-center border-r border-line lg:flex" aria-label="Primary">
      {/* the home button sits on its own above the scrolling part, so nothing ever passes behind it */}
      <div className="flex w-full shrink-0 flex-col items-center gap-3 pt-4 pb-3">
        <Link href="/" aria-label="Klique — home" className="inline-flex size-11 items-center justify-center rounded-[14px] bg-raised transition hover:bg-surface">
          <LogoMark size={34} />
        </Link>
        {withNav && (
          <nav aria-label="Main" className="flex flex-col items-center gap-1">
            {HOME_NAV.filter((n) => !n.authed || status === "authed").map((n) => {
              const on = n.match(pathname);
              return (
                <Link key={n.href} href={n.href} aria-label={n.label} title={n.label} aria-current={on ? "page" : undefined} className={`inline-flex size-11 items-center justify-center rounded-[14px] transition ${on ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised hover:text-ink"}`}>
                  <Icon name={n.icon} size={20} />
                </Link>
              );
            })}
          </nav>
        )}
        <span aria-hidden="true" className="h-px w-8 bg-line" />
      </div>
      <div className="no-bar flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto pb-4 [&>*]:shrink-0">
      <CommunityRail activeSlug={activeSlug} />
      <div className="mt-auto flex flex-col items-center gap-2">
        {status === "authed" && user ? (
          <>
            <UserMenu
              trigger={({ props }) => (
                <button {...props} title={`${user.displayName}: profile, settings, ads`} aria-label="Account menu" className="relative rounded-full">
                  <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={38} />
                  <PresenceDot presence={user.presence} self className="right-0 bottom-0 size-3 ring-2" />
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
