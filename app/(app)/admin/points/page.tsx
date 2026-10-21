"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader, Segmented } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { PointsOverview, PointsPeople, PointsPricing, RanksSettings } from "@/components/domain/admin/PointsAdmin";

type View = "overview" | "prices" | "ranks" | "people";

const INTRO: Record<View, string> = {
  overview: "Points people bought, and what they're doing with them. Points pay for picture frames and name styles; pictures and banners stay free.",
  prices: "What packs cost and what each design costs. The server always works prices out from here.",
  ranks: "Rank names, how much Hype each needs, the points each pays, and what earns Hype. People earn Hype for showing up: hosts tick off who came, hosts earn for each person who showed up, and crews earn for meeting up. Likes don't count.",
  people: "Look someone up to see their points, or give and take points (prizes, refunds, mistakes). Every change is in the audit log.",
};

/** Admin → Points: sales, prices, and one person's points. */
function PointsAdminPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "prices" || v === "ranks" || v === "people" ? v : "overview";
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Points"
          value={view}
          onChange={(next) => router.replace(`/admin/points?view=${next}`, { scroll: false })}
          options={[
            { id: "overview", label: "Overview" },
            { id: "prices", label: "Prices" },
            { id: "ranks", label: "Ranks" },
            { id: "people", label: "People" },
          ]}
        />
      </div>
      <AdminHeader title={view === "overview" ? "Points" : view === "prices" ? "Points prices" : view === "ranks" ? "Ranks & Hype" : "Someone's points"}>{INTRO[view]}</AdminHeader>
      {view === "overview" ? <PointsOverview /> : view === "prices" ? <PointsPricing /> : view === "ranks" ? <RanksSettings /> : <PointsPeople key={sp.get("who") ?? ""} initial={sp.get("who") ?? ""} />}
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
