"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { CommunityRail } from "./CommunityRail";
import { UserMenu } from "./UserMenu";

/** The icon rail inside a community, a crew chat and Messages; other pages have the home panel (HomePanel). */
export function Sidebar() {
  return <SlimNav pathname={usePathname()} />;
}

/**
 * Icon rail beside the community chat workspace, a crew's chat and Messages (like Discord's server rail): Home (the
 * logo, fixed at the top), your communities, then your account. Events, Messages, Notifications and the rest are
 * in the home panel, one click away through Home.
 */
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
