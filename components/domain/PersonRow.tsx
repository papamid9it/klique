import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { placeShort } from "@/lib/places";
import { Avatar } from "@/components/ui/Avatar";

import type { UserBrief } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";
import { PlanBadge } from "@/components/domain/account/PlanTab";

export function PersonRow({ user, action, badge, onOpen }: { user: UserBrief; action?: React.ReactNode; /** a community role's emoji on the picture (that community's member list) */ badge?: { icon: string; label: string } | null; /** tapping them does this, instead of opening their profile card */ onOpen?: () => void }) {
  const who = (
    <>
        <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={42} badge={badge} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold"><UserName name={user.displayName} effect={user.nameEffect} /> <PlanBadge plan={user.badge} size={13} /></span>
          <span className="block truncate font-mono text-[11px] text-ink-muted">
            @{user.handle} · {placeShort(user)}
          </span>
        </span>
    </>
  );
  return (
    <div className="kq-live flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface p-3">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex min-w-[11rem] flex-1 items-center gap-3 text-left">
          {who}
        </button>
      ) : (
        <ProfileTrigger handle={user.handle} className="flex min-w-[11rem] flex-1 items-center gap-3 text-left">
          {who}
        </ProfileTrigger>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
