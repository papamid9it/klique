"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader, Segmented } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { GiftsCatalogue, GiftsDashboard, GiftsSettings } from "@/components/domain/admin/GiftsAdmin";

type View = "dashboard" | "catalogue" | "settings";

const INTRO: Record<View, string> = {
  dashboard: "Hype bought (website, Apple, Google), who bought it, gifts sent (anonymous senders shown to admins only), and Klique's share against what receivers are owed. Gift payouts are paid in Payouts on the 3rd of each month.",
  catalogue: "The gifts people can send, their prices (₦10 to ₦500,000; 1 Hype is ₦10) and art. Hidden gifts can't be sent.",
  settings: "The receiver's share, how long earnings are held, the smallest payout, and the top-up packs.",
};

/** Admin → Gifts. */
function GiftsAdminPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const v = sp.get("view");
  const view: View = v === "catalogue" || v === "settings" ? v : "dashboard";
  return (
    <>
      <div className="mb-5">
        <Segmented
          label="Gifts"
          value={view}
          onChange={(next) => router.replace(`/admin/gifts?view=${next}`, { scroll: false })}
          options={[
            { id: "dashboard", label: "Dashboard" },
            { id: "catalogue", label: "Gifts" },
            { id: "settings", label: "Settings" },
          ]}
        />
      </div>
      <AdminHeader title={view === "dashboard" ? "Gifts" : view === "catalogue" ? "Gift catalogue" : "Gift settings"}>{INTRO[view]}</AdminHeader>
      {view === "dashboard" ? <GiftsDashboard /> : view === "catalogue" ? <GiftsCatalogue /> : <GiftsSettings />}
    </>
  );
}

export default function AdminGiftsPage() {
  return (
    <AdminGate>
      <Suspense fallback={null}>
        <GiftsAdminPage />
      </Suspense>
    </AdminGate>
  );
}
