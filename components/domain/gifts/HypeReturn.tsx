"use client";

import { useEffect } from "react";
import { errorMessage } from "@/app/ApiCore";
import { GiftService } from "@/app/services/GiftService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import type { GiftTargetType } from "@/lib/gifts";

/** "Get Hype and send this award", from the award tray: what to send once the top-up comes back paid */
export type AwardAfter = { reference: string; giftId: string; giftName: string; target: { type: GiftTargetType; id: string }; anonymous: boolean; clientKey: string };
const KEY = "klique:award-after";

export function rememberAward(a: AwardAfter) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(a));
  } catch {}
}

/**
 * Back from paying for Hype in the award tray (`?hype_ref=` on the same page): check the payment, send the award they
 * picked (the same client key, so it's never sent twice) and tidy the address. Settings → Hype handles its own returns.
 */
export function HypeReturn() {
  const { user } = useAuth();
  const toast = useToast();
  useEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("hype_ref");
    if (!ref || (url.pathname === "/settings" && url.searchParams.get("tab") === "hype")) return;
    let after: AwardAfter | null = null;
    try {
      after = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    } catch {}
    url.searchParams.delete("hype_ref");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    void (async () => {
      try {
        const r = await GiftService.verify(ref);
        if (!r.data.paid) return toast("Your payment hasn't come through yet. The Hype shows in Settings once it does.");
        if (!after || after.reference !== ref) return toast(`${r.data.hype.toLocaleString("en-NG")} Hype added`, "success");
        try {
          sessionStorage.removeItem(KEY);
        } catch {}
        const sent = await GiftService.send({ giftId: after.giftId, target: after.target, anonymous: after.anonymous, clientKey: after.clientKey });
        const { noteSent } = await import("./Gifts");
        noteSent(after.target, sent.data.summary);
        toast(`Hype added and ${after.giftName} sent${after.anonymous ? " anonymously" : ""}`, "success");
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    })();
    // once, when signed in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user]);
  return null;
}
