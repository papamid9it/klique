"use client";

import Link from "next/link";
import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useApi } from "@/lib/hooks/useApi";
import type { UserMe } from "@/lib/types";

/** Settings → My Account → Delete account. Asks for the password (if they have one) and their handle. */
export function DeleteAccount({ me }: { me: UserMe }) {
  const { signOut } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const check = useApi(open ? () => ProfileService.deleteCheck() : null, [open]);
  const owned = check.data?.ownedCommunities ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await ProfileService.deleteAccount({ password: me.hasPassword ? password : undefined, confirm });
      ApiClient.clearCache();
      toast("Your account was deleted", "success");
      await signOut();
    } catch (err) {
      setError(errorMessage(err));
      const fe = (err as { errors?: Record<string, string> }).errors;
      if (fe) setFieldErrors(fe);
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete your account?" description="This can't be undone." size="sm">
        {owned.length > 0 ? (
          <div className="space-y-4 text-sm">
            <p>You still own {owned.length === 1 ? "a community" : "these communities"}. Hand {owned.length === 1 ? "it" : "them"} to another member (Members → Make owner) or delete {owned.length === 1 ? "it" : "them"} first, so the members aren&apos;t left without an owner.</p>
            <ul className="space-y-1">
              {owned.map((c) => (
                <li key={c.slug}>
                  <Link href={`/communities/${c.slug}`} className="font-medium text-accent-text hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
              <li>Your profile, friends, memberships, RSVPs and saved events are deleted.</li>
              <li>Events you host are deleted.</li>
              <li>Messages and posts you wrote stay in their conversations, shown as &ldquo;Deleted user&rdquo;.</li>
            </ul>
            {me.hasPassword && <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} required />}
            <TextField label={`Type your handle (${me.handle}) to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fieldErrors.confirm} autoComplete="off" required />
            {error && !Object.keys(fieldErrors).length && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={busy} disabled={check.loading}>
                Delete forever
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
