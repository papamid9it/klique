"use client";

import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { PRESENCES, type Presence } from "@/lib/constants";
import { StatusIcon } from "./ProfileParts";

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
      items={[{ type: "label", label: "Set your status" }, ...PRESENCES.map((s) => ({ label: s.label, leading: <StatusIcon presence={s.id} />, checked: s.id === current, onSelect: () => (onChange?.(s.id), void set(s.id)) }))]}
      trigger={({ props }) => (
        <button {...props} className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12.5px] font-semibold hover:bg-raised">
          <StatusIcon presence={current} size={10} />
          {PRESENCES.find((s) => s.id === current)?.label}
          <Icon name="chevron-down" size={12} />
        </button>
      )}
    />
  );
}
