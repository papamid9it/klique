"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { AuthField } from "@/components/domain/auth/AuthField";
import { AuthCard, Notice } from "@/components/domain/auth/AuthShell";
import { GoogleButton, OrDivider } from "@/components/domain/auth/GoogleButton";
import { PlaceFields } from "@/components/domain/places/PlaceFields";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/hooks/useApi";
import { HANDLE_REGEX, LIMITS } from "@/lib/constants";
import type { Place } from "@/lib/places";

/** Only same-site relative paths are allowed as a post-login destination (no open redirects). */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

const PAGE_NOTICES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified: "That Google account's email isn't verified, so we can't use it.",
  suspended: "This account has been suspended. Contact support if you think that's a mistake.",
};

const PERKS = [
  { icon: "calendar", title: "Events near you", text: "Parties, meetups and shows in your city, ranked for you." },
  { icon: "users", title: "Communities", text: "Channels, topics and voice rooms for the people you actually like." },
  { icon: "message", title: "Everyone in one place", text: "Message friends, RSVP, and bring people along." },
] as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: config } = useApi(() => AuthService.config(), []);
  const google = !!config?.google;
  return mode === "login" ? <LoginCard next={next} google={google} notice={PAGE_NOTICES[params.get("error") ?? ""]} reset={params.get("reset") === "1"} /> : <SignupCard next={next} google={google} />;
}

/* --------------------------------- log in --------------------------------- */

function LoginCard({ next, google, notice, reset }: { next: string; google: boolean; notice?: string; reset: boolean }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await AuthService.login(email, password);
      setSession(res.data.user);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors) setErrors(err.errors);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard wide>
      <div className="grid md:grid-cols-[minmax(0,1fr)_17.5rem]">
        <form onSubmit={submit} noValidate className="space-y-5 p-7 sm:p-10">
          <div className="text-center md:text-left">
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">Welcome back!</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">We&apos;re so excited to see you again.</p>
          </div>

          {reset && <Notice tone="success">Password updated. Sign in with your new password.</Notice>}
          {notice && <Notice tone="error">{notice}</Notice>}

          <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={errors.email} required autoFocus />
          <AuthField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            error={errors.password}
            required
            below={
              <Link href="/forgot-password" className="mt-2 inline-block text-sm font-medium text-accent-text hover:underline">
                Forgot your password?
              </Link>
            }
          />

          {formError && !Object.keys(errors).length && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="h-12 w-full">
            Log in
          </Button>

          {google && (
            <>
              <OrDivider />
              <GoogleButton next={next} />
            </>
          )}

          <p className="text-sm text-ink-muted">
            Need an account?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-text hover:underline">
              Register
            </Link>
          </p>
        </form>

        <aside aria-label="About klique" className="hidden flex-col justify-center gap-6 rounded-r-[22px] border-l border-line bg-canvas/60 p-8 md:flex">
          <p className="text-[19px] leading-snug font-semibold tracking-[-0.025em]">Find your people, then find something to do together.</p>
          <ul className="space-y-5">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-text">
                  <Icon name={p.icon} size={16} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.title}</span>
                  <span className="block text-[13px] leading-snug text-ink-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </AuthCard>
  );
}

/* --------------------------------- sign up -------------------------------- */

const STEP1_FIELDS = ["email", "displayName", "handle", "password"];

function SignupCard({ next, google }: { next: string; google: boolean }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [place, setPlace] = useState<Place>({ country: "NG", region: "lagos", city: "lagos" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  /** The quick checks the person can fix right now; the server still decides everything. */
  function checkStep1() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email";
    if (!displayName.trim()) e.displayName = "Tell us what to call you";
    const h = handle.replace(/^@/, "");
    if (h.length < LIMITS.handleMin) e.handle = `At least ${LIMITS.handleMin} characters`;
    else if (!HANDLE_REGEX.test(h)) e.handle = "Letters, numbers and underscores only";
    if (password.length < 8) e.password = "Use at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (checkStep1()) setStep(2);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await AuthService.signup({ email: email.trim(), password, displayName: displayName.trim(), handle: handle.replace(/^@/, ""), ...place });
      setSession(res.data.user);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors) {
        setErrors(err.errors);
        // a problem with something typed on the first screen: take them back to it
        if (STEP1_FIELDS.some((f) => err.errors?.[f])) setStep(1);
      }
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <form onSubmit={step === 1 ? onContinue : onCreate} noValidate className="space-y-5 p-7 sm:p-10">
        <div className="text-center">
          <p className="eyebrow">Step {step} of 2</p>
          <h1 className="mt-2 text-[26px] font-bold tracking-[-0.03em]">{step === 1 ? "Create an account" : "Where are you based?"}</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{step === 1 ? "Join communities and find events in your city." : "We use this to show you what's happening near you. You can change it any time."}</p>
        </div>

        {step === 1 ? (
          <>
            {google && (
              <>
                <GoogleButton next={next} label="Sign up with Google" />
                <OrDivider />
              </>
            )}
            <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={errors.email} required autoFocus />
            <AuthField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={LIMITS.displayName} autoComplete="name" error={errors.displayName} required />
            <AuthField label="Username" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} maxLength={LIMITS.handleMax} autoComplete="username" hint="Letters, numbers and underscores" error={errors.handle} required />
            <AuthField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 8 characters" error={errors.password} required />
            {formError && !Object.keys(errors).length && <Notice tone="error">{formError}</Notice>}
            <Button type="submit" variant="primary" size="lg" className="h-12 w-full">
              Continue
            </Button>
          </>
        ) : (
          <>
            <PlaceFields value={place} onChange={setPlace} errors={errors} />
            {formError && !STEP1_FIELDS.some((f) => errors[f]) && <Notice tone="error">{formError}</Notice>}
            <Button type="submit" variant="primary" size="lg" loading={busy} className="h-12 w-full">
              Create account
            </Button>
            <button type="button" onClick={() => setStep(1)} className="mx-auto flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
              <span aria-hidden="true">&larr;</span> Back
            </button>
          </>
        )}

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-text hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
