"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { TIMEOUTS } from "./TimeoutModal";

const UNTIL_LIFTED = "ban";

/** Stop someone writing in Posts and on Boards, for a while or until it's lifted. They stay in the community and can chat. */
export function PostBanModal({ slug, user, onClose, onDone }: { slug: string; user: { id: string; displayName: string }; onClose: () => void; onDone: (postBan: { until: string | null; reason: string | null } | null) => void }) {
  const toast = useToast();
  const [how, setHow] = useState(UNTIL_LIFTED);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const res = await SpaceService.setPostBan(slug, user.id, how === UNTIL_LIFTED ? null : Number(how), reason.trim());
      toast("Done. They've been told.", "success");
      onDone(res.data.postBan);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Stop ${user.displayName} from Posts and Boards`} description="They can't post or comment there. They stay in the community and can still chat, react and go to events." size="sm">
      <div className="space-y-4">
        <SelectField label="How long" value={how} onChange={(e) => setHow(e.target.value)}>
          <option value={UNTIL_LIFTED}>Banned: until you lift it</option>
          {TIMEOUTS.map((t) => (
            <option key={t.seconds} value={t.seconds}>
              Suspended: {t.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Reason (optional)" hint="They'll see this." value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void save()}>
            Stop them
          </Button>
        </div>
      </div>
    </Modal>
  );
}
