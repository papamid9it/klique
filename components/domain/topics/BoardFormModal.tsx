"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { TopicService } from "@/app/services/TopicService";
import { Button } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LIMITS } from "@/lib/constants";
import type { BoardDTO } from "@/lib/types";

/** Create or edit a board: admins choose its name ("Updates", "Projects"…) and who may post in it. */
export function BoardFormModal({ slug, board, onClose, onSaved }: { slug: string; board?: BoardDTO; onClose: () => void; onSaved: (b: BoardDTO) => void }) {
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [postPolicy, setPostPolicy] = useState<"members" | "admins">(board?.postPolicy ?? "members");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    setErr(undefined);
    try {
      const input = { name: name.trim(), description: description.trim(), postPolicy };
      const res = board ? await TopicService.updateBoard(slug, board.id, input) : await TopicService.createBoard(slug, input);
      onSaved(res.data);
    } catch (e2) {
      setErrs((e2 as { errors?: Record<string, string> }).errors ?? {});
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={board ? "Edit board" : "New board"} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Name" hint="Call it whatever fits: Updates, Projects, Questions…" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.boardName} required autoFocus error={errs.name} />
        <TextArea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.boardDescription} rows={2} />
        <SelectField label="Who can post" value={postPolicy} onChange={(e) => setPostPolicy(e.target.value as "members" | "admins")}>
          <option value="members">Everyone in the community</option>
          <option value="admins">Only owners and admins</option>
        </SelectField>
        {err && !errs.name && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            {board ? "Save" : "Create board"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
