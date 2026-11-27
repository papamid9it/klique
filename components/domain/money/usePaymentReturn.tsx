"use client";

import { useEffect, useRef } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MoneyService } from "@/app/services/MoneyService";
import { useToast } from "@/components/providers/ToastProvider";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * Back from Paystack (?payment=kdn_… or kct_…): check the payment with the server, say how it went, and tidy the
 * address. Calls `onPaid` so the page can refresh what it shows.
 */
let handled: string | null = null;
export function usePaymentReturn(onPaid?: () => void) {
  const toast = useToast();
  const paid = useRef(onPaid);
  useEffect(() => {
    paid.current = onPaid;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("payment");
    // once per payment, however many places on the page ask
    if (!ref || handled === ref) return;
    handled = ref;
    url.searchParams.delete("payment");
    url.searchParams.delete("reference");
    url.searchParams.delete("trxref");
    void MoneyService.verify(ref)
      .then((r) => {
        if (r.data.paid) {
          toast(`Thank you! ${naira(r.data.amount)} contributed.`, "success");
          paid.current?.();
        } else toast("We couldn't confirm that payment yet. If you paid, it'll show up in a minute.", "error");
      })
      .catch((e) => toast(errorMessage(e), "error"))
      .finally(() => window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash));
  }, [toast]);
}
