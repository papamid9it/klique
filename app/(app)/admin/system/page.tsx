"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { REELS_MIN_VIDEOS } from "@/lib/constants";
import { AdminHeader, Badge, Panel } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";

/** Reels stay off until you turn them on: tapping a post just opens it. */
function ReelsSwitch() {
  const toast = useToast();
  const { data, setData } = useApi(() => AdminService.reels(), []);
  const [busy, setBusy] = useState(false);
  async function flip() {
    if (!data) return;
    setBusy(true);
    try {
      setData((await AdminService.setReels(!data.on)).data);
      toast(data.on ? "Reels are off" : "Reels are on", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-6">
      <Panel title="Reels" action={data ? <Badge tone={data.on ? "good" : "bad"}>{data.on ? "On" : "Off"}</Badge> : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            {data?.on
              ? `Tapping a picture or video opens reels for anyone who can see at least ${REELS_MIN_VIDEOS} recent videos. Everyone else just gets the post.`
              : "Tapping a picture or video just opens the post. Turn this on when there's enough to swipe through."}
            {data ? ` ${data.recentVideos.toLocaleString("en-US")} ${data.recentVideos === 1 ? "video" : "videos"} posted in the last 30 days. After turning them on, it can take about 10 minutes to reach everyone, or as soon as the app is reopened.` : ""}
          </p>
          <Button variant={data?.on ? "secondary" : "primary"} onClick={() => void flip()} disabled={!data} loading={busy}>
            {data?.on ? "Turn reels off" : "Turn reels on"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function AdminSystemPageContent() {
  const { data: s, loading, error, reload } = useApi(() => AdminService.system(), []);
  const needed = s ? s.checks.filter((c) => !c.ok && !c.optional).length : 0;

  return (
    <>
      <AdminHeader title="System">What&apos;s switched on for this deployment. Settings live in your environment variables (Vercel → Settings → Environment Variables); change them there and redeploy.</AdminHeader>
      <ReelsSwitch />
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
