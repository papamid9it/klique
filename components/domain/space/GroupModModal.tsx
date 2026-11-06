"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Switch, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { GROUP_POWERS, GROUP_TITLE_MAX, PERMISSIONS, type GroupPower } from "@/lib/roles";
import type { MemberDTO } from "@/lib/types";

/** A group's owner names someone (Moderator, Treasurer, whatever they like) and picks what they can do in the group. */
export function GroupModModal({ slug, subSlug, member, onClose, onSaved }: { slug: string; subSlug: string; member: MemberDTO; onClose: () => void; onSaved: (title: string | null, powers: GroupPower[]) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(member.title ?? "");
  const [powers, setPowers] = useState<GroupPower[]>(member.powers ?? []);
  const [busy, setBusy] = useState(false);
  const toggle = (p: GroupPower, on: boolean) => setPowers((now) => (on ? [...now, p] : now.filter((x) => x !== p)));

  async function save() {
    setBusy(true);
    try {
      const res = await SpaceService.setGroupMod(slug, subSlug, member.user.id, { title: title.trim(), powers });
      toast("Saved", "success");
      onSaved(res.data.title, res.data.powers);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${member.user.displayName} in this group`} description="Give them a title, and choose what they can do here." size="sm">
      <div className="space-y-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={GROUP_TITLE_MAX} placeholder="Moderator" />
        <div className="space-y-3">
          {GROUP_POWERS.map((p) => {
            const info = PERMISSIONS.find((x) => x.id === p)!;
            return <Switch key={p} checked={powers.includes(p)} onChange={(on) => toggle(p, on)} label={info.label} hint={info.hint} />;
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
