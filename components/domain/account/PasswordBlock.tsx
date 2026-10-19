"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import type { UserMe } from "@/lib/types";

/** Change password, or (for Google-only accounts) add one so the email can sign in too. */
export function PasswordBlock({ me }: { me: UserMe }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setErrors({});
    setFormError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (next !== again) {
      setErrors({ again: "The passwords don't match" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await AuthService.changePassword(next, me.hasPassword ? current : undefined);
      setUser(res.data.user);
      toast(me.hasPassword ? "Password changed. Other devices were signed out." : "Password added. You can now sign in with your email too.", "success");
      close();
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors) {
        setErrors({ ...err.errors, ...(err.errors.newPassword ? { next: err.errors.newPassword } : {}) });
      }
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={() => setOpen(true)}>{me.hasPassword ? "Change password" : "Add a password"}</Button>
        {me.hasPassword && (
          <Link href="/forgot-password" className="text-sm font-medium text-accent-text hover:underline">
            Forgot your password?
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md space-y-4 rounded-card border border-line bg-surface p-5">
      {me.hasPassword && <TextField label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" error={errors.currentPassword} required />}
      <TextField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="At least 8 characters" error={errors.next} required />
      <TextField label="Confirm new password" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" error={errors.again} required />
      {formError && !Object.keys(errors).length && (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {me.hasPassword ? "Update password" : "Save password"}
        </Button>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
