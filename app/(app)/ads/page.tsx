"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage } from "@/app/ApiCore";
import { CampaignService } from "@/app/services/CampaignService";
import { AdsBilling, AdsHelp, AdsMobileBar, AdsOverview, AdsPanel, AdsTablePage, type AdsTab } from "@/components/domain/ads/AdsManager";
import { PanelLayout } from "@/components/layout/PanelLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRealtimeEvent } from "@/components/providers/RealtimeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";

/**
 * Your ads: everything you've sent, where each one is (waiting, needs changes, approved, booked, running,
 * ended), what happens next, and its results. Paystack sends people back here after paying.
 */
function AdsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { status, requireAuth } = useAuth();
  const authed = status === "authed";
  const { data, loading, error, reload, setData } = useApi(authed ? () => CampaignService.mine() : null, [authed], { key: "my-ads" });

  useEffect(() => {
    if (status === "anon") requireAuth();
  }, [status, requireAuth]);
  // an admin approved it, it started, it ended…: the list follows
  useRealtimeEvent(() => void reload(), { filter: (e) => e.type === "notify" && e.category === "ads", debounceMs: 300 });

  // back from Paystack: confirm the payment, then start the ad
  const reference = sp.get("reference") ?? sp.get("trxref");
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (!authed || !reference || checked.current === reference) return;
    checked.current = reference;
    void CampaignService.verify(reference)
      .then((res) => {
        setData((list) => (list ?? []).map((c) => (c.id === res.data.id ? res.data : c)));
        toast(res.data.status === "paid" ? "Payment received. Your ad is booked." : "We couldn't confirm that payment yet. Try again in a minute.", res.data.status === "paid" ? "success" : "error");
      })
      .catch((e) => toast(errorMessage(e), "error"))
      .finally(() => router.replace("/ads", { scroll: false }));
  }, [authed, reference, setData, toast, router]);

  const list = data ?? [];
  const t = sp.get("tab");
  const tab: AdsTab = t === "ads" || t === "billing" || t === "help" ? t : "overview";
  const TITLE: Record<string, string> = { overview: "Overview", ads: "Ads", billing: "Billing", help: "How ads work" };

  return (
    <PanelLayout panel={<AdsPanel tab={tab} />} mobile={<AdsMobileBar tab={tab} />}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">Ads Manager</p>
          <h1 className="text-[clamp(1.6rem,3vw,2.1rem)] font-bold tracking-[-0.03em]">{TITLE[tab]}</h1>
        </div>
        <Button variant="primary" href="/ads/new" className="hidden sm:inline-flex">
          <Icon name="plus" size={15} /> Create ad
        </Button>
      </header>
      {loading || status === "loading" ? (
        <RowSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : tab === "overview" ? (
        <AdsOverview list={list} />
      ) : tab === "ads" ? (
        <AdsTablePage list={list} />
      ) : tab === "billing" ? (
        <AdsBilling list={list} />
      ) : (
        <AdsHelp />
      )}
    </PanelLayout>
  );
}

export default function AdsPage() {
  return (
    <Suspense fallback={null}>
      <AdsContent />
    </Suspense>
  );
}
