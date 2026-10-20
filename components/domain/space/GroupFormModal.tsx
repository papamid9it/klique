"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LIMITS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";

/** Create a group inside a community. Shared by the groups page and the community dropdown. */
export function GroupFormModal({ slug, communityName, onClose, onCreated }: { slug: string; communityName: string; onClose: () => void; onCreated: (groupSlug: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const res = await SubcommunityService.create(slug, { name: name.trim(), description: description.trim() });
      toast("Group created", "success");
      onCreated(res.data.slug);
    } catch (err) {
      setErrs((err as { errors?: Record<string, string> }).errors ?? {});
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create group" description={`A smaller, private space inside ${communityName}, with its own channels and events.`}>
      <form onSubmit={create} className="space-y-4">
        <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.communityName} required autoFocus error={errs.name} />
        <TextArea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.communityDescription} error={errs.description} />
        <p className="flex items-start gap-2 rounded-control border border-line bg-raised/60 px-3 py-2.5 text-[13px] text-ink-muted">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          <span>Groups are private. Only people you add can see it, and you can add up to {LIMITS.groupMembers} people from {communityName}.</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            Create group
          </Button>
        </div>
      </form>
    </Modal>
  );
}
