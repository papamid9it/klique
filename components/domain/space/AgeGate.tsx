"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { AdultGate, CommunityDTO } from "@/lib/types";

/**
 * In front of an 18+ community someone may not enter yet (server/policies/adult): it asks for what's missing,
 * one step at a time, and opens the community once they're through. Nothing of the community shows meanwhile.
 */
export function AgeGate({ community: c, onPassed }: { community: CommunityDTO; onPassed: () => void }) {
  const { setUser, requireAuth } = useAuth();
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const gate = c.ageGate as Exclude<AdultGate, "under_18">;

  async function run(fn: () => Promise<{ data: Parameters<typeof setUser>[0] }>) {
    setBusy(true);
    setProblem(null);
    try {
      setUser((await fn()).data);
      onPassed();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 text-center">
      <span className="mx-auto mb-4 inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-raised px-3 font-mono text-sm font-bold text-accent-text">18+</span>
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{c.name}</h1>
      <p className="mt-2 text-sm text-ink-muted">{c.explicit ? "This community is for people 18 and over and may show explicit content." : "This community is for people 18 and over."}</p>

      {gate === "sign_in" && (
        <Button variant="primary" className="mt-5" onClick={() => requireAuth()}>
          Sign in to continue
        </Button>
      )}
      {gate === "dob_required" && (
        <form
          className="mt-5 space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (dob) void run(() => ProfileService.updateMe({ dob }));
          }}
        >
          <label className="block text-[13px] font-medium" htmlFor="age-gate-dob">
            Your date of birth
          </label>
          <input id="age-gate-dob" type="date" required value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="h-11 w-full rounded-control border border-line bg-raised px-3 text-sm text-ink" />
          <p className="text-xs text-ink-muted">You can set it once. To change it later, contact Klique support.</p>
          <Button type="submit" variant="primary" loading={busy} disabled={!dob} className="w-full">
            Continue
          </Button>
        </form>
      )}
      {gate === "confirm_adult" && (
        <Button variant="primary" className="mt-5" loading={busy} onClick={() => void run(() => ProfileService.confirmAdult())}>
          I&apos;m 18 or older
        </Button>
      )}
      {gate === "explicit_optin" && (
        <div className="mt-5 space-y-2">
          <p className="text-sm">To see it, turn on Show explicit content in Settings.</p>
          <Button href="/settings?tab=privacy" variant="primary">
            <Icon name="sliders" size={15} /> Open Settings
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {problem}
        </p>
      )}
    </section>
  );
}
