"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader, Segmented } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { EarningSettings, HypeOverview, HypePricing, PointsPeople } from "@/components/domain/admin/PointsAdmin";

type View = "overview" | "prices" | "earning" | "people";

const INTRO: Record<View, string> = {
  overview: "Hype people bought, and what they're doing with it. Hype is the currency you buy: it pays for picture frames and name styles; pictures and banners stay free.",
  prices: "What Hype packs cost and what each design costs in Hype. The server always works prices out from here.",
  earning: "Points are earned reputation, never bought. People earn them when others come to their events, upvote their posts and board posts, and react well to their messages in community and group chats. Each action has its own daily cap.",
  people: "Look someone up to see their Hype and points, or give and take either (prizes, refunds, mistakes). Every change is in the audit log.",
};

/** Admin → Points: Hype sales and prices, what earns points, and one person's Hype and points. */
function PointsAdminPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "prices" || v === "earning" || v === "people" ? v : "overview";
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Points"
          value={view}
          onChange={(next) => router.replace(`/admin/points?view=${next}`, { scroll: false })}
          options={[
            { id: "overview", label: "Hype sales" },
            { id: "prices", label: "Hype prices" },
            { id: "earning", label: "Earning points" },
            { id: "people", label: "People" },
          ]}
        />
      </div>
      <AdminHeader title={view === "overview" ? "Hype sales" : view === "prices" ? "Hype prices" : view === "earning" ? "Earning points" : "Someone's Hype & points"}>{INTRO[view]}</AdminHeader>
      {view === "overview" ? <HypeOverview /> : view === "prices" ? <HypePricing /> : view === "earning" ? <EarningSettings /> : <PointsPeople key={sp.get("who") ?? ""} initial={sp.get("who") ?? ""} />}
    </>
  );
}

export default function AdminPointsPage() {
  return (
    <AdminGate>
      <Suspense fallback={null}>
        <PointsAdminPage />
      </Suspense>
    </AdminGate>
  );
}
