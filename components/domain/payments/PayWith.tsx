"use client";

import { useState } from "react";
import { usePayments } from "@/lib/hooks/usePayments";
import type { PayProvider } from "@/lib/types";

const KEY = "klique:payWith";

function remembered(): PayProvider | null {
  try {
    return (localStorage.getItem(KEY) as PayProvider | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Which company to pay with, when the admin has switched on more than one (Admin → System → Payments).
 * `provider` goes with the checkout request; `picker` is the row of choices (nothing when there's only one).
 * Their last choice is remembered on this browser.
 */
export function usePayWith(): { provider: PayProvider | undefined; picker: React.ReactNode } {
  const pay = usePayments();
  const [picked, setPicked] = useState<PayProvider | null>(remembered);
  const live = pay?.providers ?? [];
  const provider = live.find((p) => p.id === picked)?.id ?? live[0]?.id;
  const choose = (id: PayProvider) => {
    setPicked(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private window: just this time */
    }
  };
  const picker =
    live.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-muted">Pay with</span>
        <div role="radiogroup" aria-label="Pay with" className="flex flex-wrap gap-1.5">
          {live.map((p) => {
            const on = p.id === provider;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p.id)}
                className={`h-8 rounded-control border px-3 text-sm font-medium transition-colors ${on ? "border-ink bg-ink text-canvas" : "border-line text-ink hover:bg-raised"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;
  return { provider, picker };
}

/** "Paystack", "Flutterwave or OPay"… for sentences about how people pay. */
export function usePayNames(): string {
  const live = usePayments()?.providers ?? [];
  const names = live.map((p) => p.label);
  return names.length <= 1 ? (names[0] ?? "card") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
