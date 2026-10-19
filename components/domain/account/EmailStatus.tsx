"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AuthService } from "@/app/services/AuthService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";

/** "Resend the email" with its own busy state, shared by the settings page and the banner. */
export function useResendVerification() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      const res = await AuthService.resendVerification();
      if (res.data.alreadyVerified) toast("Your email is already confirmed.", "success");
      else {
        setSent(true);
        toast("Sent. Check your inbox (and spam).", "success");
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return { resend, busy, sent };
}

export function ResendButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const { resend, busy, sent } = useResendVerification();
  return (
    <Button size={size} onClick={resend} loading={busy} disabled={sent}>
      {sent ? "Email sent" : "Resend email"}
    </Button>
  );
}
