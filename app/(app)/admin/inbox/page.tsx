"use client";

import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate, useAdmin } from "@/components/domain/admin/AdminShell";
import { EventInbox } from "@/components/domain/admin/EventInbox";

function AdminInboxPageContent() {
  const { summary, refresh } = useAdmin();
  return (
    <>
      <AdminHeader title="Event finder">Find events by place, category and date from official APIs and the pages you add, review them, then post the good ones. Nothing here is public until you post it.</AdminHeader>
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
