"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

const num = (v: string) => Math.min(1_000_000, Math.max(0, Math.round(Number(v) || 0)));

/**
 * One points minimum with its own Save, where it belongs in a community's settings (to join: Overview; to post:
 * Posts). Same rules as above: 0 means anyone, owners and admins never need any.
 */
export function MinPointField({ label, hint, value, onSave }: { label: string; hint: string; value: number; onSave: (v: number) => Promise<void> }) {
  const toast = useToast();
  const [v, setV] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const dirty = num(v) !== value;

  async function save() {
    setBusy(true);
    try {
      await onSave(num(v));
      toast("Saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full max-w-[14rem]">
          <TextField label={label} type="number" min={0} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty}>
          Save
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setV(String(value))}>
            Undo
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
