"use client";

import { AdminService } from "@/app/services/AdminService";
import { AdminHeader, Badge, Panel } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";

function AdminSystemPageContent() {
  const { data: s, loading, error, reload } = useApi(() => AdminService.system(), []);
  const needed = s ? s.checks.filter((c) => !c.ok && !c.optional).length : 0;

  return (
    <>
      <AdminHeader title="System">What&apos;s switched on for this deployment. Settings live in your environment variables (Vercel → Settings → Environment Variables); change them there and redeploy.</AdminHeader>
      {loading ? (
        <Skeleton className="h-80 w-full rounded-card" />
      ) : error || !s ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel title="Services" action={needed ? <Badge tone="bad">{needed} need setting up</Badge> : <Badge tone="good">All required services on</Badge>}>
            <ul className="divide-y divide-line">
              {s.checks.map((c) => (
                <li key={c.id} className="flex gap-3 px-4 py-3.5">
                  <span className={cx("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-success/15 text-success" : c.optional ? "bg-raised text-ink-muted" : "bg-danger/15 text-danger")}>
                    <Icon name={c.ok ? "check" : c.optional ? "info" : "x"} size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {c.label}
                      {c.ok ? <Badge tone="good">On</Badge> : c.optional ? <Badge>Optional · off</Badge> : <Badge tone="bad">Off</Badge>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="space-y-6">
            <Panel title="Site admins">
              <ul className="divide-y divide-line">
                {s.admins.map((a) => (
                  <li key={a} className="flex items-center gap-2 px-4 py-2.5 font-mono text-[13px]">
                    <Icon name="shield" size={13} className="text-ink-muted" /> {a}
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">Set by ADMIN_EMAILS (comma-separated). Admins can&apos;t be suspended from the console.</p>
            </Panel>
            <Panel title="Settings">
              <dl className="divide-y divide-line text-sm">
                {[
                  ["Environment", s.environment],
                  ["App address", s.appUrl],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="font-mono text-[13px] break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminSystemPage() {
  return (
    <AdminGate>
      <AdminSystemPageContent />
    </AdminGate>
  );
}
