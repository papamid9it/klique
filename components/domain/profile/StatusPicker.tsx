"use client";

import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { PRESENCES, type Presence } from "@/lib/constants";
import { PresenceDot } from "./ProfileParts";

/** Your status (the dot on your picture): Online, Idle, Do not disturb, Invisible. Changes at once; saved behind. */
export function useSetStatus() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  return async (presence: Presence) => {
    if (!user || user.presence === presence) return;
    const before = user;
    setUser({ ...user, presence });
    try {
      await ProfileService.updateMe({ presence });
    } catch (e) {
      setUser(before);
      toast(errorMessage(e), "error");
    }
  };
}

/** The status button and its menu, for your own profile (popout and full profile). */
export function StatusPicker({ className, onChange }: { className?: string; onChange?: (p: Presence) => void }) {
  const { user } = useAuth();
  const set = useSetStatus();
  if (!user) return null;
  const current = user.presence;
  return (
    <Dropdown
      label="Set your status"
      align="right"
      width={200}
      className={className}
      items={[{ type: "label", label: "Set your status" }, ...PRESENCES.map((s) => ({ label: s.label, hint: s.id === current ? "Current" : undefined, onSelect: () => (onChange?.(s.id), void set(s.id)) }))]}
      trigger={({ props }) => (
        <button {...props} className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12.5px] font-semibold hover:bg-raised">
          <span className="relative size-2.5">
            <PresenceDot presence={current} className="inset-0 size-2.5 ring-0" />
            {current === "invisible" && <span className="absolute inset-0 rounded-full border-2 border-ink-muted" />}
          </span>
          {PRESENCES.find((s) => s.id === current)?.label}
          <Icon name="chevron-down" size={12} />
        </button>
      )}
    />
  );
}
