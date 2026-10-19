"use client";

import { useState } from "react";
import { AdminService } from "@/app/services/AdminService";
import { EventInbox } from "@/components/domain/admin/EventInbox";
import { HostsPanel } from "@/components/domain/admin/HostsPanel";
import { ReportsQueue } from "@/components/domain/admin/ReportsQueue";
import { PageTitle } from "@/components/layout/PageTitle";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { useApi } from "@/lib/hooks/useApi";

type Tab = "reports" | "inbox" | "hosts";

function Admin() {
  const [tab, setTab] = useState<Tab>("reports");
  const summary = useApi(() => AdminService.summary(), []);
  const s = summary.data;
  const refresh = () => void summary.reload();

  return (
    <>
      <Tabs
        label="Admin"
        active={tab}
        onChange={(id) => setTab(id as Tab)}
        items={[
          { id: "reports", label: "Reports", count: s ? s.reports.open : null },
          { id: "inbox", label: "Event inbox", count: s?.pendingDrafts ?? null },
          { id: "hosts", label: "Hosts" },
        ]}
      />
      <div className="mt-6">
        {tab === "reports" && <ReportsQueue counts={s?.reports ?? null} onChanged={refresh} />}
        {tab === "inbox" && <EventInbox pending={s?.pendingDrafts ?? null} onChanged={refresh} />}
        {tab === "hosts" && <HostsPanel minMembers={s?.hostMinMembers ?? null} />}
      </div>
    </>
  );
}

export default function AdminPage() {
  const { status, user, requireAuth } = useAuth();
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Site admin" title="Admin">
        Reports, events waiting for approval, and who can post public events.
      </PageTitle>
      {status === "loading" ? (
        <Skeleton className="h-48 w-full rounded-card" />
      ) : status === "anon" ? (
        <EmptyState icon="lock" title="Sign in first" action={<Button variant="primary" onClick={() => requireAuth()}>Sign in</Button>} />
      ) : !user?.isAdmin ? (
        <EmptyState icon="lock" title="Admins only">
          This page is for Klique&apos;s site admins.
        </EmptyState>
      ) : (
        <Admin />
      )}
    </div>
  );
}
