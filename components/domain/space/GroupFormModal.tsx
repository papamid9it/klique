"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LIMITS } from "@/lib/constants";
import type { SubVisibility } from "@/lib/types";
import { VisibilityPicker } from "./parts";

/** Create a group inside a community. Shared by the groups page and the community dropdown. */
export function GroupFormModal({ slug, communityName, onClose, onCreated }: { slug: string; communityName: string; onClose: () => void; onCreated: (groupSlug: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<SubVisibility>("parent");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const res = await SubcommunityService.create(slug, { name: name.trim(), description: description.trim(), visibility });
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
    <Modal open onClose={onClose} title="Create group" description={`A smaller space inside ${communityName}, with its own channels, events and members.`}>
      <form onSubmit={create} className="space-y-4">
        <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.communityName} required autoFocus error={errs.name} />
        <TextArea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.communityDescription} error={errs.description} />
        <VisibilityPicker value={visibility} onChange={setVisibility} />
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
