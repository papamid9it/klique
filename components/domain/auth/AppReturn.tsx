"use client";

import { useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/domain/auth/AuthShell";
import { Spinner, buttonClass } from "@/components/ui/Button";

// a plain <a>: klique:// isn't a page of this site, so no client-side routing
/** The browser half of signing in to the Klique app: open the app, and say what to do if it didn't open. */
export function AppReturn({ target, failed }: { target: string | null; failed: boolean }) {
  const [slow, setSlow] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    if (!target || opened.current) return;
    opened.current = true;
    window.location.href = target; // the browser asks "Open Klique?" the first time
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <AuthCard>
      <div className="space-y-5 p-7 text-center sm:p-10">
        {!target ? (
          <>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">This link didn&apos;t work</h1>
            <p className="text-[15px] leading-relaxed text-ink-muted">Go back to the Klique app and choose Continue with Google again.</p>
          </>
        ) : failed ? (
          <>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">Sign-in didn&apos;t finish</h1>
            <p className="text-[15px] leading-relaxed text-ink-muted">We&apos;ve sent you back to the Klique app. Try again from there.</p>
            <a href={target} className={buttonClass("primary", "lg", "h-12 w-full")}>
              Open Klique
            </a>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
              &#10003;
            </span>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">You&apos;re signed in</h1>
            {!slow ? (
              <p className="flex items-center justify-center gap-2.5 text-[15px] text-ink-muted" aria-busy="true">
                <Spinner size={16} /> Opening Klique...
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-ink-muted">
                If your browser asked, choose <strong className="text-ink">Open Klique</strong>. Nothing happened? Use the button.
              </p>
            )}
            <a href={target} className={buttonClass("primary", "lg", "h-12 w-full")}>
              Open Klique
            </a>
            <p className="text-[13px] text-ink-muted">Once the app is open you can close this tab. The link works once and only in your app.</p>
          </>
        )}
      </div>
    </AuthCard>
  );
}
