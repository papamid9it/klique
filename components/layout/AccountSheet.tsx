"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import type { MenuEntry } from "@/components/ui/Dropdown";
import { useAccountMenu } from "./UserMenu";

/**
 * Phones: the account menu (the same items as the desktop dropdown) as a bottom sheet, from "Me" in the bottom
 * bar. Your status is a row of choices; each item closes the sheet and does its thing.
 */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  // the admin console is for computers (on a phone /admin asks first): not offered here
  const items = useAccountMenu()?.filter((e) => !(e.type === undefined && "label" in e && e.label === "Admin console"));
  if (!user || !items) return null;
  const row = "flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-[16px] font-medium transition active:bg-raised";
  const render = (e: MenuEntry, i: number) => {
    if (e.type === "sep") return <hr key={i} className="my-1.5 border-line" />;
    if (e.type === "label") return <p key={i} className="eyebrow px-3 pt-2">{e.label}</p>;
    if (e.type === "submenu") {
      return (
        <div key={i} className="px-1 pb-1">
          <p className="mb-1.5 flex items-center gap-2 px-2 text-[13px] text-ink-muted">
            {e.leading} {e.label}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {e.items.map((s, j) =>
              s.type === undefined || s.type === "item" ? (
                <button key={j} type="button" onClick={s.onSelect} aria-pressed={!!s.checked} className={cx("flex min-h-11 items-center gap-2 rounded-control border px-3 text-[15px]", s.checked ? "border-accent-text bg-accent/10 font-semibold" : "border-line")}>
                  {s.leading} {s.label}
                </button>
              ) : null,
            )}
          </div>
        </div>
      );
    }
    return (
      <button
        key={i}
        type="button"
        onClick={() => {
          onClose();
          e.onSelect();
        }}
        className={cx(row, e.danger ? "text-danger" : "text-ink")}
      >
        {e.icon && <Icon name={e.icon} size={20} className={e.danger ? "" : "text-ink-muted"} />}
        {e.label}
      </button>
    );
  };
  return (
    <Modal open={open} onClose={onClose} title={user.displayName} description={`@${user.handle}`} size="sm">
      <div className="-mt-1 mb-2 flex justify-center sm:hidden" aria-hidden="true">
        <Avatar name={user.displayName} src={user.avatarUrl} size={56} />
      </div>
      <nav aria-label="Account menu" className="space-y-0.5">
        {items.map(render)}
      </nav>
    </Modal>
  );
}
