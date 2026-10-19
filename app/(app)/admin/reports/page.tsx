"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate, useAdmin } from "@/components/domain/admin/AdminShell";
import { ReportsQueue } from "@/components/domain/admin/ReportsQueue";

function AdminReportsPageContent() {
  const { summary, refresh } = useAdmin();
  return (
    <>
      <AdminHeader title="Reports">What people have flagged, oldest first. Acting on a report closes every other open report about the same thing.</AdminHeader>
      <ReportsQueue counts={summary?.reports ?? null} onChanged={refresh} />
    </>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGate>
      <AdminReportsPageContent />
    </AdminGate>
  );
}
