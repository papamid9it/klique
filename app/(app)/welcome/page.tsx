"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { OnboardingService } from "@/app/services/OnboardingService";
import { CommunityCard } from "@/components/domain/CommunityCard";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { useCategories } from "@/lib/hooks/useCategories";

/**
 * Joining Klique: (1) pick at least 3 categories, (2) join at least 2 communities from suggestions in them (your
 * city first). Klique itself is automatic. The app sends anyone who hasn't finished back here; the server checks.
 */
export default function WelcomePage() {
  const router = useRouter();
  const toast = useToast();
  const { user, status, refresh, signOut } = useAuth();
  const categories = useCategories();
  const { data, loading, error, reload, setData } = useApi(status === "authed" ? () => OnboardingService.state() : null, [status]);
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  // the "join at least N" note, drawn to the eye when someone tries to go on too early
  const [nudge, setNudge] = useState(0);

  // where finishing takes them (home, or the community they clicked): the "already done" redirect goes there too
  const goingTo = useRef("/");
  // sent back here from another page before finishing: say so, once
  const [sentBack, setSentBack] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("why") !== "finish") return;
    setSentBack(true);
    window.history.replaceState(null, "", "/welcome");
  }, []);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
    else if (user?.onboarded) router.replace(goingTo.current);
  }, [status, user?.onboarded, router]);

  if (status !== "authed" || loading || (!data && !error)) {
    return (
      <Frame>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-64 rounded-card" />
      </Frame>
    );
  }
  if (error || !data) return <Frame><ErrorState message={error} onRetry={() => void reload()} /></Frame>;

  const chosen = picked ?? data.interests.filter((i) => categories.some((c) => c.id === i));
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  async function next() {
    setBusy(true);
    try {
      setData((await OnboardingService.interests(chosen)).data);
      setStep(2);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  /** Done: into Klique (or straight to the community they clicked). */
  async function finish(to = "/") {
    setBusy(true);
    goingTo.current = to;
    try {
      await OnboardingService.complete();
      ApiClient.clearCache(); // the homepage asks fresh: their new communities' events are there straight away
      await refresh();
      router.replace(to);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }

  const left = Math.max(0, data.needed - data.joined);
  const tooEarly = (msg: string) => {
    toast(msg);
    setNudge((n) => n + 1);
  };
  // a community card links to the community, but the app sends anyone who hasn't finished back here: say why
  // instead of bouncing them, and once they've joined enough, finish and take them there
  const onLink = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (left > 0) tooEarly(`Join at least ${data.needed} communities first (${left} more to go). You can open them once you're in.`);
    else void finish(a.getAttribute("href") || "/");
  };

  return (
    <Frame onSignOut={() => void signOut()}>
      {sentBack && (
        <p role="status" className="mb-5 flex items-start gap-2 rounded-card border border-accent-text/40 bg-accent/10 px-4 py-3 text-sm">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Almost there.</span> Finish these two steps first: pick at least {data.minInterests} interests, then join at least {data.needed} communities. Then everything opens up.
          </span>
        </p>
      )}
      <p className="eyebrow">Step {step} of 2</p>
      {step === 1 ? (
        <>
          <h1 className="display mt-2 text-[clamp(2rem,6vw,3rem)]">What are you into?</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-muted">Pick at least {data.minInterests}. We&apos;ll show you communities for them next, starting with ones in your city.</p>
          <ul className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {categories.map((c) => {
              const on = chosen.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.id)}
                    className={cx("flex h-16 w-full items-center gap-3 rounded-card border px-4 text-left text-[15px] font-semibold transition", on ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:bg-raised")}
                  >
                    <span aria-hidden="true" className="text-xl">{c.glyph}</span>
                    <span className="min-w-0 flex-1 leading-tight">{c.name}</span>
                    {on && <Icon name="check" size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Bar>
            <p className="mr-auto text-sm text-ink-muted">{chosen.length < data.minInterests ? `${data.minInterests - chosen.length} more to go` : `${chosen.length} picked`}</p>
            <Button variant="primary" size="lg" onClick={() => (chosen.length < data.minInterests ? tooEarly(`Pick at least ${data.minInterests} to continue (${data.minInterests - chosen.length} more).`) : void next())} loading={busy} className={cx(chosen.length < data.minInterests && "opacity-60")}>
              Continue <Icon name="arrow-left" size={16} className="rotate-180" />
            </Button>
          </Bar>
        </>
      ) : (
        <>
          <h1 className="display mt-2 text-[clamp(2rem,6vw,3rem)]">Join your first communities</h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-muted">
            Join at least {data.needed}. Their events and chats are what fill your homepage, along with Klique&apos;s own events. You&apos;re already in Klique.
            {data.widened && " There aren't many in your categories yet, so here are some others too."}
          </p>
          {/* the rule, plainly, where they're looking (it pulses when they try to go on too early) */}
          <p key={nudge} role="status" className={cx("mt-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium", left ? "border-accent-text/50 bg-accent/10 text-ink" : "border-line text-ink-muted", nudge > 0 && left > 0 && "animate-pop")}>
            <Icon name={left ? "info" : "check"} size={15} />
            {left ? `Join at least ${data.needed} communities to continue: ${data.joined} of ${data.needed} joined.` : `${data.joined} joined. You're ready. Tap Go to Klique, or open one of them.`}
          </p>
          {data.suggestions.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onClickCapture={onLink}>
              {data.suggestions.map((c) => (
                <CommunityCard key={c.id} community={c} onChange={() => void reload()} />
              ))}
            </div>
          ) : (
            <p className="mt-7 rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted">There are no communities to join yet. You can start one once you&apos;re in.</p>
          )}
          <Bar>
            <Button onClick={() => setStep(1)}>
              <Icon name="arrow-left" size={16} /> Back
            </Button>
            <p className="mr-auto ml-1 text-sm text-ink-muted">{left ? `Join ${left} more` : `${data.joined} joined`}</p>
            <Button variant="primary" size="lg" onClick={() => (left > 0 ? tooEarly(`Join at least ${data.needed} communities to continue (${left} more to go).`) : void finish())} loading={busy} className={cx(left > 0 && "opacity-60")}>
              Go to Klique <Icon name="arrow-left" size={16} className="rotate-180" />
            </Button>
          </Bar>
        </>
      )}
    </Frame>
  );
}

function Frame({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo tagline />
        {onSignOut && (
          <button type="button" onClick={onSignOut} className="text-sm font-medium text-ink-muted hover:text-ink">
            Sign out
          </button>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-36 sm:px-8">{children}</main>
    </div>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-8">{children}</div>
    </div>
  );
}
