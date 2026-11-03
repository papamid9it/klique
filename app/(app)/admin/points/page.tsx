"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader, Segmented } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { EarningSettings, PointsPeople } from "@/components/domain/admin/PointsAdmin";

type View = "earning" | "people";

const INTRO: Record<View, string> = {
  earning: "Points are earned reputation, never bought. People earn them when others come to their events, upvote their posts and board posts, and react well to their messages in community and group chats. Each action has its own daily cap.",
  people: "Look someone up to see their points, or give and take some (prizes, mistakes). Every change is in the audit log. (Hype, the old bought currency, is gone: leftover Hype became Lite days. Plans are under Admin → Plans.)",
};

/** Admin → Points: what earns points, and one person's points. */
function PointsAdminPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "people" ? v : "earning";
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Points"
          value={view}
          onChange={(next) => router.replace(`/admin/points?view=${next}`, { scroll: false })}
          options={[
            { id: "earning", label: "Earning points" },
            { id: "people", label: "People" },
          ]}
        />
      </div>
      <AdminHeader title={view === "earning" ? "Earning points" : "Someone's points"}>{INTRO[view]}</AdminHeader>
      {view === "earning" ? <EarningSettings /> : <PointsPeople key={sp.get("who") ?? ""} initial={sp.get("who") ?? ""} />}
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
