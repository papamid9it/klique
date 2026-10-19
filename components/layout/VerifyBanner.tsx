"use client";

import { AuthService } from "@/app/services/AuthService";
import { ResendButton } from "@/components/domain/account/EmailStatus";
import { useAuth } from "@/components/providers/AuthProvider";
import { useApi } from "@/lib/hooks/useApi";

/** A slim reminder for signed-in people who haven't confirmed their email. Only shown when emails really go out. */
export function VerifyBanner() {
  const { user, status } = useAuth();
  const needs = status === "authed" && !!user && !user.emailVerified;
  const { data: config } = useApi(needs ? () => AuthService.config() : null, [needs]);
  if (!needs || !config?.emailVerification) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-accent/10 px-4 py-2.5 text-sm sm:px-8 lg:px-10">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Confirm your email.</span> <span className="text-ink-muted">We sent a link to {user.email}. You need it to host events and start communities.</span>
      </p>
      <ResendButton />
    </div>
  );
}
