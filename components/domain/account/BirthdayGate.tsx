"use client";

import { useEffect, useRef, useState } from "react";
import { AuthService } from "@/app/services/AuthService";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import type { Place } from "@/lib/places";
import { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { DeleteAccount } from "./DeleteAccount";

/**
 * "When's your birthday?": for an account with no date of birth (a Google sign-up, or one from before it was asked),
 * before anything else. Age rules need it (18+ communities, kliques), and the server refuses everything else until
 * it's given. It's set once; after that only Klique support can change it.
 */
export function BirthdayGate() {
  const { user, setUser, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [dob, setDob] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // today, once (a date string compares like a date)
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  // where they are (a Google sign-up has only the default): the network's guess to start with, one tap to keep
  const [place, setPlace] = useState<Place>({ country: user?.country || "NG", region: user?.region ?? "", city: user?.city ?? "" });
  const placeTouched = useRef(false);
  // only a brand-new account takes the guess; an older one keeps the place it has
  const fresh = !!user && Date.now() - new Date(user.joinedAt).getTime() < 2 * 86_400_000;
  useEffect(() => {
    if (!fresh) return;
    void AuthService.placeGuess().then((r) => {
      if (r.data && !placeTouched.current) setPlace(r.data);
    }, () => {});
  }, [fresh]);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob < today && dob > "1900-01-01";
  const pretty = valid ? new Date(`${dob}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (!sure) return setSure(true);
    setBusy(true);
    setError("");
    try {
      setUser((await ProfileService.updateMe({ dob, ...(place.city ? place : { country: place.country }) })).data);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 py-8">
      <form onSubmit={save} className="w-full max-w-sm space-y-5 rounded-card border border-line bg-surface p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">When&apos;s your birthday?</h1>
          <p className="mt-1.5 text-sm text-ink-muted">We need it once, to keep 18+ communities and kliques to adults. It&apos;s never shown on your profile. And where you are, so you see what&apos;s on near you.</p>
        </div>
        <TextField label="Date of birth" type="date" value={dob} onChange={(e) => (setDob(e.target.value), setSure(false))} max={today} autoComplete="bday" required />
        <PlaceFields value={place} onChange={(p) => { placeTouched.current = true; setPlace(p); setSure(false); }} />
        {sure && <p className="rounded-control border border-line bg-raised/60 px-3 py-2 text-sm">Save <strong>{pretty}</strong>? You can&apos;t change it yourself after this.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!valid}>
          {sure ? "Yes, save it" : "Continue"}
        </Button>
        <button type="button" onClick={() => void signOut()} className="w-full text-center text-sm text-ink-muted underline">
          Sign out
        </button>
        {user && !deleting && (
          <button type="button" onClick={() => setDeleting(true)} className="w-full text-center text-sm text-ink-muted underline">
            Delete my account instead
          </button>
        )}
      </form>
      {/* deleting the account never needs a birthday first */}
      {user && deleting && (
        <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6">
          <DeleteAccount me={user} />
        </div>
      )}
    </main>
  );
}
