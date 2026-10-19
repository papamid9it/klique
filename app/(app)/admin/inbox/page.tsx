"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate, useAdmin } from "@/components/domain/admin/AdminShell";
import { EventInbox } from "@/components/domain/admin/EventInbox";

function AdminInboxPageContent() {
  const { summary, refresh } = useAdmin();
  return (
    <>
      <AdminHeader title="Event inbox">Events found on other sites, waiting for a look. Nothing here is public until you approve it.</AdminHeader>
      <EventInbox pending={summary?.pendingDrafts ?? null} onChanged={refresh} />
    </>
  );
}

export default function AdminInboxPage() {
  return (
    <AdminGate>
      <AdminInboxPageContent />
    </AdminGate>
  );
}
