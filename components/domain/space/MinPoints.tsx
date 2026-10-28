"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { SettingsBlock } from "@/components/ui/SettingsShell";

const num = (v: string) => Math.min(1_000_000, Math.max(0, Math.round(Number(v) || 0)));

/**
 * Settings → Points needed: the points (earned, never bought) someone needs to join (or be added to) a community
 * or group, and to post in its Posts section (nothing else is held back). 0 means anyone. Owners, admins and site admins never need any.
 */
export function MinPointsForm({ join, post, what, onSave }: { join: number; post: number; what: "community" | "group"; onSave: (v: { minPointsJoin: number; minPointsPost: number }) => Promise<void> }) {
  const toast = useToast();
  const [j, setJ] = useState(String(join));
  const [p, setP] = useState(String(post));
  const [busy, setBusy] = useState(false);
  const dirty = num(j) !== join || num(p) !== post;

  async function save() {
    setBusy(true);
    try {
      await onSave({ minPointsJoin: num(j), minPointsPost: num(p) });
      toast("Saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsBlock title="Points needed" intro={`Points are earned from other people (upvotes, good reactions, showing up to events) and can't be bought. Ask for a minimum to keep out brand-new or spammy accounts. 0 means anyone. Owners and admins never need any.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={what === "group" ? "Minimum points to be added" : "Minimum points to join"} type="number" min={0} inputMode="numeric" value={j} onChange={(e) => setJ(e.target.value)} hint={what === "group" ? "People below it can't be added to the group." : "Shown on its card and page. People already in stay in."} />
        <TextField label="Minimum points to post" type="number" min={0} inputMode="numeric" value={p} onChange={(e) => setP(e.target.value)} hint="Posts section only. Below it, members can still chat, use boards, comment, vote and react." />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty}>
          Save
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => (setJ(String(join)), setP(String(post)))}>
            Undo
          </Button>
        )}
      </div>
    </SettingsBlock>
  );
}

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
