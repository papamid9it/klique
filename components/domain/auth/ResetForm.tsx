"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { AuthField } from "@/components/domain/auth/AuthField";
import { AuthCard, Notice } from "@/components/domain/auth/AuthShell";
import { Button, Spinner } from "@/components/ui/Button";
import { useApi } from "@/lib/hooks/useApi";

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  // Ask first, so a dead link says so straight away instead of after typing a password.
  const check = useApi(token ? () => AuthService.checkResetToken(token) : null, [token]);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== again) {
      setFieldErrors({ again: "The passwords don't match" });
      return;
    }
    setBusy(true);
    try {
      await AuthService.resetPassword(token, password);
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors?.password) setFieldErrors({ password: err.errors.password });
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token || check.error) {
    return (
      <AuthCard>
        <div className="space-y-5 p-7 text-center sm:p-10">
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">This link has expired</h1>
          <p className="text-[15px] leading-relaxed text-ink-muted">Reset links work once, for one hour. Ask for a fresh one and you&apos;ll be back in a minute.</p>
          <Button href="/forgot-password" variant="primary" size="lg" className="h-12 w-full">
            Send a new link
          </Button>
          <Link href="/login" className="inline-block text-sm font-semibold text-accent-text hover:underline">
            Back to log in
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (check.loading) {
    return (
      <AuthCard>
        <div className="flex items-center justify-center gap-3 p-12 text-ink-muted" aria-busy="true">
          <Spinner size={18} /> Checking your link...
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form onSubmit={submit} noValidate className="space-y-5 p-7 sm:p-10">
        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">Choose a new password</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">You&apos;ll be signed out everywhere else.</p>
        </div>
        <AuthField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 8 characters" error={fieldErrors.password} required autoFocus />
        <AuthField label="Confirm new password" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" error={fieldErrors.again} required />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="h-12 w-full">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
