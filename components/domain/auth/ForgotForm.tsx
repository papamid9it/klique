"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { AuthField } from "@/components/domain/auth/AuthField";
import { AuthCard, Notice } from "@/components/domain/auth/AuthShell";
import { Button } from "@/components/ui/Button";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    try {
      await AuthService.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors?.email) setFieldError(err.errors.email);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard>
        <div className="space-y-5 p-7 text-center sm:p-10">
          <span aria-hidden="true" className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-accent/15 text-2xl">
            &#9993;
          </span>
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">Check your email</h1>
          <p className="text-[15px] leading-relaxed text-ink-muted">
            If an account exists for <span className="font-semibold text-ink">{sentTo}</span>, we&apos;ve sent a link to choose a new password. It works for an hour.
          </p>
          <p className="text-sm text-ink-muted">Nothing there? Check spam, or try again in a few minutes.</p>
          <Button href="/login" variant="primary" size="lg" className="h-12 w-full">
            Back to log in
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form onSubmit={submit} noValidate className="space-y-5 p-7 sm:p-10">
        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-[-0.03em]">Forgot your password?</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">Enter your email and we&apos;ll send you a link to reset it.</p>
        </div>
        <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={fieldError} required autoFocus />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="h-12 w-full">
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link href="/login" className="font-semibold text-accent-text hover:underline">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
