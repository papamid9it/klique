"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { AuthCard } from "@/components/domain/auth/AuthShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button, Spinner } from "@/components/ui/Button";

export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const { refresh, status } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  // The link works once, so make sure React's double-run in development doesn't spend it twice.
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    AuthService.verifyEmail(token)
      .then(() => {
        setState("done");
        void refresh(); // clears the "confirm your email" banner
      })
      .catch((e) => {
        setMessage(errorMessage(e));
        setState("failed");
      });
  }, [token, refresh]);

  return (
    <AuthCard>
      <div className="space-y-5 p-7 text-center sm:p-10">
        {state === "working" && (
          <div className="flex items-center justify-center gap-3 py-6 text-ink-muted" aria-busy="true">
            <Spinner size={18} /> Confirming your email...
          </div>
        )}
        {state === "done" && (
          <>
            <span aria-hidden="true" className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
              &#10003;
            </span>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">Email confirmed</h1>
            <p className="text-[15px] text-ink-muted">You&apos;re all set. You can host events and start communities now.</p>
            <Button href="/" variant="primary" size="lg" className="h-12 w-full">
              Continue to klique.
            </Button>
          </>
        )}
        {state === "failed" && (
          <>
            <h1 className="text-[26px] font-bold tracking-[-0.03em]">This link didn&apos;t work</h1>
            <p className="text-[15px] leading-relaxed text-ink-muted">{message || "It may have expired or already been used."} Sign in and ask for a new one from Settings.</p>
            <Button href={status === "authed" ? "/settings" : "/login?next=%2Fsettings"} variant="primary" size="lg" className="h-12 w-full">
              {status === "authed" ? "Open settings" : "Log in"}
            </Button>
          </>
        )}
      </div>
    </AuthCard>
  );
}
