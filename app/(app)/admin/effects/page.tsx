"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { EffectsAdmin } from "@/components/domain/admin/EffectsAdmin";

/** Admin → Profile effects. */
export default function AdminEffectsPage() {
  return (
    <AdminGate>
      <AdminHeader title="Profile effects">Animations that play over people&apos;s profile cards, unlocked with Hype. Upload a Lottie (.lottie or .json).</AdminHeader>
      <EffectsAdmin />
    </AdminGate>
  );
}
