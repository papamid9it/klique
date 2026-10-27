"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader, Segmented } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { FeesSettings, PayoutsList } from "@/components/domain/admin/PayoutsAdmin";

type View = "requested" | "paid" | "rejected" | "fees";

const INTRO: Record<View, string> = {
  requested: "Community owners asking for their balance. Send the bank transfer, then mark it paid with the transfer's reference. Turning one down puts the money back in their balance.",
  paid: "Payouts that have been sent.",
  rejected: "Payouts that were turned down, with the reason the owner saw.",
  fees: "What Klique keeps from donations and event contributions, and the smallest payout.",
};

/** Admin → Payouts: requests to send, history, and Klique's fees. */
function PayoutsAdminPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "paid" || v === "rejected" || v === "fees" ? v : "requested";
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Payouts"
          value={view}
          onChange={(next) => router.replace(`/admin/payouts?view=${next}`, { scroll: false })}
          options={[
            { id: "requested", label: "Waiting" },
            { id: "paid", label: "Paid" },
            { id: "rejected", label: "Turned down" },
            { id: "fees", label: "Fees" },
          ]}
        />
      </div>
      <AdminHeader title={view === "fees" ? "Fees" : "Payouts"}>{INTRO[view]}</AdminHeader>
      {view === "fees" ? <FeesSettings /> : <PayoutsList key={view} status={view} />}
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <AdminGate>
      <Suspense fallback={null}>
        <PayoutsAdminPage />
      </Suspense>
    </AdminGate>
  );
}
