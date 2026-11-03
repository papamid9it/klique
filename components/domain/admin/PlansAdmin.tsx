"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubscriptionService } from "@/app/services/SubscriptionService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import { PLAN_NAMES, planPerks, type PlanConfig, type PlanId } from "@/lib/plans";

const PLANS: PlanId[] = ["free", "lite", "pro"];
type Draft = Record<string, string>;

const toDraft = (c: PlanConfig): Draft => ({
  "prices.lite": String(c.prices.lite),
  "prices.pro": String(c.prices.pro),
  ...Object.fromEntries(PLANS.flatMap((p) => [
    [`create.${p}`, String(c.create[p])],
    [`join.${p}`, c.join[p] === null ? "" : String(c.join[p])],
    [`mediaSlots.${p}`, String(c.mediaSlots[p])],
    [`communitiesCreate.${p}`, String(c.communitiesCreate[p])],
    [`communitiesJoin.${p}`, String(c.communitiesJoin[p])],
    [`groupsCreate.${p}`, String(c.groupsCreate[p])],
    [`webhooks.${p}`, String(c.webhooks[p])],
    [`emojiSlots.${p}`, String(c.emojiSlots[p])],
  ])),
});

/**
 * Admin → Plans: what Lite and Pro cost a month, and each plan's limits (kliques started a month, kliques you can be
 * in at once — empty is no limit — and profile slots and how many may be videos). A new price applies to new
 * subscriptions; people already paying keep theirs. Below: give someone free days of a plan.
 */
export function PlansAdmin() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => SubscriptionService.adminConfig(), [], { key: "admin-plans" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [who, setWho] = useState("");
  const [plan, setPlan] = useState<"lite" | "pro">("lite");
  const [days, setDays] = useState("30");
  const [granting, setGranting] = useState(false);

  if (loading && !data) return <Skeleton className="h-96 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const d = draft ?? toDraft(data);
  const set = (k: string, v: string) => setDraft({ ...d, [k]: v });
  const num = (k: string) => Math.round(Number(d[k]));

  async function save() {
    setSaving(true);
    try {
      const next = (
        await SubscriptionService.setConfig({
          prices: { lite: num("prices.lite"), pro: num("prices.pro") },
          create: { free: num("create.free"), lite: num("create.lite"), pro: num("create.pro") },
          join: { free: d["join.free"] === "" ? null : num("join.free"), lite: d["join.lite"] === "" ? null : num("join.lite"), pro: d["join.pro"] === "" ? null : num("join.pro") },
          mediaSlots: { free: num("mediaSlots.free"), lite: num("mediaSlots.lite"), pro: num("mediaSlots.pro") },
          communitiesCreate: { free: num("communitiesCreate.free"), lite: num("communitiesCreate.lite"), pro: num("communitiesCreate.pro") },
          communitiesJoin: { free: num("communitiesJoin.free"), lite: num("communitiesJoin.lite"), pro: num("communitiesJoin.pro") },
          groupsCreate: { free: num("groupsCreate.free"), lite: num("groupsCreate.lite"), pro: num("groupsCreate.pro") },
          webhooks: { free: num("webhooks.free"), lite: num("webhooks.lite"), pro: num("webhooks.pro") },
          emojiSlots: { free: num("emojiSlots.free"), lite: num("emojiSlots.lite"), pro: num("emojiSlots.pro") },
        })
      ).data;
      setData(next);
      setDraft(null);
      toast("Plans saved", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: string, label: string, hint?: string) => <TextField label={label} type="number" inputMode="numeric" min={0} value={d[k]} onChange={(e) => set(k, e.target.value)} hint={hint} />;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p} className="space-y-3 rounded-card border border-line bg-surface p-4">
            <h3 className="text-lg font-semibold">{PLAN_NAMES[p]}</h3>
            {p !== "free" ? field(`prices.${p}`, "Price (₦ a month)") : <p className="text-sm text-ink-muted">Free for everyone.</p>}
            {field(`create.${p}`, "Kliques started a month")}
            <TextField label="Kliques in at once" type="number" inputMode="numeric" min={0} value={d[`join.${p}`]} onChange={(e) => set(`join.${p}`, e.target.value)} hint="Empty: no limit. Hosting doesn't count." />
            {field(`mediaSlots.${p}`, "Gallery slots, photos or videos (0–24)")}
            {field(`communitiesCreate.${p}`, "Communities they can own")}
            {field(`communitiesJoin.${p}`, "Communities they can be in", "Klique HQ doesn't count.")}
            {field(`groupsCreate.${p}`, "Groups they can start per community")}
            {field(`webhooks.${p}`, "Webhooks / bots per community they own")}
            {field(`emojiSlots.${p}`, "Custom emoji per community they own")}
            <ul className="space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
              {planPerks(p, data).map((l) => (
                <li key={l}>· {l}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <div className="flex justify-end gap-2">
        {draft && <Button onClick={() => setDraft(null)}>Undo changes</Button>}
        <Button variant="primary" loading={saving} disabled={!draft} onClick={() => void save()}>
          Save plans
        </Button>
      </div>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h3 className="text-base font-semibold">Give someone free days</h3>
        <p className="text-sm text-ink-muted">Prizes, refunds, partners. Added on top of any time they already have. It&apos;s in the audit log.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem_7rem_auto] sm:items-end">
          <TextField label="Who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="@handle" />
          <SelectField label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as "lite" | "pro")}>
            <option value="lite">Lite</option>
            <option value="pro">Pro</option>
          </SelectField>
          <TextField label="Days" type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} />
          <Button
            variant="primary"
            loading={granting}
            disabled={!who.trim()}
            onClick={async () => {
              setGranting(true);
              try {
                const r = await SubscriptionService.grant(who.trim(), plan, Math.round(Number(days)));
                toast(`Done. ${who.trim()} has ${PLAN_NAMES[plan]} until ${new Date(r.data.until).toLocaleDateString("en-GB")}.`, "success");
                setWho("");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setGranting(false);
              }
            }}
          >
            Give
          </Button>
        </div>
      </section>
    </div>
  );
}
