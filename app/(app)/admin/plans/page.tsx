"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { PlansAdmin } from "@/components/domain/admin/PlansAdmin";

/** Admin → Plans: Lite and Pro prices, every plan's limits, and free days for someone. */
export default function AdminPlansPage() {
  return (
    <AdminGate>
      <AdminHeader title="Plans">Free, Lite and Pro: what the paid plans cost a month, and what each plan allows. Paid on Paystack; people cancel any time in Settings.</AdminHeader>
      <PlansAdmin />
    </AdminGate>
  );
}
