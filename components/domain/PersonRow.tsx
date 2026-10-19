import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { placeShort } from "@/lib/places";
import { Avatar } from "@/components/ui/Avatar";

import type { UserBrief } from "@/lib/types";
import { UserName } from "@/components/ui/UserName";

export function PersonRow({ user, action }: { user: UserBrief; action?: React.ReactNode }) {
  return (
    <div className="kq-live flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface p-3">
      <ProfileTrigger handle={user.handle} className="flex min-w-[11rem] flex-1 items-center gap-3 text-left">
        <Avatar name={user.displayName} src={user.avatarUrl} frame={user.avatarFrame} size={42} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold"><UserName name={user.displayName} effect={user.nameEffect} /></span>
          <span className="block truncate font-mono text-[11px] text-ink-muted">
            @{user.handle} · {placeShort(user)}
          </span>
        </span>
      </ProfileTrigger>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
