"use client";

import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Switch } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { CommunityDTO } from "@/lib/types";

/**
 * Your own notification settings in one community (every member has their own): for now, "Suppress @everyone and
 * @here", an on/off switch, so turning it back off is plain to see.
 */
export function CommunityNotifySettings({ c, onChanged }: { c: Pick<CommunityDTO, "slug" | "suppressEveryone">; onChanged: () => void | Promise<void> }) {
  const toast = useToast();
  const [on, setOn] = useState(!!c.suppressEveryone);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function set(next: boolean) {
    setOn(next);
    setBusy(true);
    try {
      await new ApiClient().put(`/api/communities/${c.slug}/notify`, { suppressEveryone: next });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
      toast(next ? "@everyone and @here won't notify you here" : "@everyone and @here notify you again", "success");
      await onChanged();
    } catch (e) {
      setOn(!next);
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Switch
      checked={on}
      status={busy ? "saving" : saved ? "saved" : undefined}
      onChange={(v) => void set(v)}
      label="Suppress @everyone and @here"
      hint="On: messages that ping everyone in this community won't notify you or count as a mention. You still see them. Turn it off to get those notifications again."
    />
  );
}

/** The same, in a small window (from the community's menu, for every member). */
export function CommunityNotifyModal({ c, open, onClose, onChanged }: { c: Pick<CommunityDTO, "slug" | "name" | "suppressEveryone">; open: boolean; onClose: () => void; onChanged: () => void | Promise<void> }) {
  return (
    <Modal open={open} onClose={onClose} title="Notification settings" description={`Just for you, in ${c.name}.`} size="sm">
      <CommunityNotifySettings c={c} onChanged={onChanged} />
    </Modal>
  );
}
