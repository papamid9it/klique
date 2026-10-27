"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { UserMe } from "@/lib/types";

/**
 * Settings → Age & content (server/policies/adult): the date of birth (set once; Klique support changes it after
 * that), and Show explicit content: off by default, 18+ only, on with an agreement. In a phone app this switch can
 * only be turned off (the server refuses on from the app); people turn it on here on the web.
 */
export function AgeSettings({ me }: { me: UserMe }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [agree, setAgree] = useState(false);

  async function saveDob() {
    setBusy(true);
    try {
      setUser((await ProfileService.updateMe({ dob })).data);
      toast("Date of birth saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function explicit(on: boolean) {
    setBusy(true);
    try {
      setUser((await ProfileService.setExplicit(on, on ? agree : undefined)).data);
      setAsking(false);
      setAgree(false);
      toast(on ? "Explicit content is on" : "Explicit content is off", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-medium">Date of birth</p>
        {me.dob ? (
          <p className="mt-1 text-sm">
            {new Date(`${me.dob}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            <span className="block text-xs text-ink-muted">Set. To change it, contact Klique support.</span>
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Date of birth" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="h-10 rounded-control border border-line bg-raised px-3 text-sm text-ink" />
            <Button size="sm" variant="primary" loading={busy} disabled={!dob} onClick={() => void saveDob()}>
              Save
            </Button>
            <span className="w-full text-xs text-ink-muted">Only used to keep 18+ communities to adults. You can set it once.</span>
          </div>
        )}
      </div>
      <Switch
        label="Show explicit content"
        hint={!me.isAdult ? "Only for people 18 and over, by your date of birth." : me.explicitOnAt ? `On since ${new Date(me.explicitOnAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Lets you into communities that allow explicit content; explicit posts still show blurred until you tap.` : "Off. Communities that allow explicit content stay hidden from you."}
        checked={!!me.explicitOnAt}
        disabled={busy || (!me.isAdult && !me.explicitOnAt)}
        onChange={(on) => (on ? setAsking(true) : void explicit(false))}
      />
      {asking && (
        <Modal open onClose={() => setAsking(false)} title="Show explicit content?" size="sm">
          <div className="space-y-4 text-sm">
            <p>This lets you into communities that allow explicit content (adult themes, including sexual content between adults). It never shows in your feeds, search or Discover, and explicit posts stay blurred until you tap them.</p>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
              <span>I&apos;m 18 or older and I choose to see explicit content. I&apos;ve read the <Link href="/terms#adult" className="underline">rules</Link>.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} disabled={!agree} onClick={() => void explicit(true)}>
                Turn on
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
