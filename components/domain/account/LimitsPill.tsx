"use client";

import ApiClient from "@/app/ApiCore";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { Envelope, LimitsDTO } from "@/lib/types";
import { UpgradePrompt } from "./PlanTab";

const api = new ApiClient();
const PLAN = { free: "Free", lite: "Lite", pro: "Pro" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });

/**
 * How much of your plan you've used, beside a page's buttons (Kliques, Communities): "2/3 in | 1 start left". A click
 * opens what's left, when it comes back, and the way to more (Lite or Pro, Pro, or on Pro the Klique Team).
 * Nothing for site admins (no limits) or anyone signed out.
 */
export function LimitsPill({ kind }: { kind: "kliques" | "communities" }) {
  const { user } = useAuth();
  const { data: l } = useApi(user ? () => api.get<Envelope<LimitsDTO>>("/api/me/limits") : null, [user?.id], { key: "my-limits" });
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  if (!l || l.unlimited) return null;
  const k = l.kliques;
  const c = l.communities;
  const startsLeft = Math.max(0, k.startMax - k.started);
  const label = kind === "kliques" ? `${k.inNow}/${k.inMax ?? "∞"} in` : `${c.joined}/${c.joinMax} in`;
  const sub = kind === "kliques" ? `${startsLeft} start${startsLeft === 1 ? "" : "s"} left` : `${Math.max(0, c.ownMax - c.owned)} to make`;
  const full = kind === "kliques" ? (k.inMax !== null && k.inNow >= k.inMax) || startsLeft === 0 : c.joined >= c.joinMax || c.owned >= c.ownMax;
  const extras = l.extras.filter((e) => (kind === "kliques" ? e.kind.startsWith("klique") : e.kind.startsWith("community")));
  const rows = kind === "kliques"
    ? [{ title: "In at once", used: k.inNow, max: k.inMax, line: "Leave one, or once it's over, to join another." }, { title: "Started this month", used: k.started, max: k.startMax, line: `More on ${day(k.resetsAt)}.` }]
    : [{ title: "Joined", used: c.joined, max: c.joinMax, line: "Leave one to join another. Klique HQ doesn't count." }, { title: "Made", used: c.owned, max: c.ownMax, line: "Communities you own. Everything you have keeps working if your plan changes." }];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Your ${kind}: ${label}, ${sub}`} className={cx("inline-flex h-10 items-center gap-2 rounded-full border bg-surface px-3.5 text-[13px] transition hover:bg-raised", full ? "border-ink" : "border-line")}>
        <span className="font-semibold">{label}</span>
        <span className="h-3.5 w-px bg-line" aria-hidden="true" />
        <span className="text-ink-muted">{sub}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Your ${kind}`} description={`On the ${PLAN[l.plan]} plan`} size="sm">
        <div className="space-y-5">
          {rows.map((r) => (
            <div key={r.title}>
              <p className="flex justify-between text-sm"><span className="font-semibold">{r.title}</span><span className="text-ink-muted">{r.max === null ? `${r.used} · no limit` : `${r.used} of ${r.max}`}</span></p>
              {r.max !== null && (
                <div className="mt-2 flex gap-1.5" aria-hidden="true">
                  {Array.from({ length: Math.min(r.max, 12) }, (_, i) => <span key={i} className={cx("h-2 flex-1 rounded-full", i < Math.round((r.used / Math.max(1, r.max!)) * Math.min(r.max!, 12)) ? "bg-ink" : "bg-raised")} />)}
                </div>
              )}
              <p className="mt-1.5 text-[13px] text-ink-muted">{r.line}</p>
            </div>
          ))}
          {extras.length > 0 && <p className="text-[13px] text-ink-muted">{extras.map((e) => `+${e.n} from the Klique Team until ${day(e.until)}`).join(" · ")}</p>}
          <Button className="w-full" onClick={() => (setOpen(false), setAsk(l.nextPlan ? `${kind === "kliques" ? "Kliques" : "Communities"}: see what Lite and Pro give.` : `You're on Pro, the top plan.`))}>
            {l.nextPlan ? (l.plan === "free" ? "See Lite and Pro" : "See Pro") : "Ask the Klique Team for more"}
          </Button>
        </div>
      </Modal>
      <UpgradePrompt message={ask} onClose={() => setAsk(null)} />
    </>
  );
}
