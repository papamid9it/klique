"use client";

import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { AdminHeader } from "@/components/domain/admin/AdminParts";
import { AdminGate } from "@/components/domain/admin/AdminShell";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { formatDateShort } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { Envelope } from "@/lib/types";
import type { FeedbackDTO } from "@/server/services/feedback.service";

const api = new ApiClient();
const KIND = { feedback: "Feedback", problem: "Problem", safety: "Child safety" } as const;

/** Admin → Feedback: what people sent from Help & feedback in the apps. Child safety concerns first. */
function FeedbackContent() {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const { data, loading, error, reload, setData } = useApi(() => api.get<Envelope<FeedbackDTO[]>>("/api/admin/feedback", { done: done ? "1" : "0" }), [done]);
  async function mark(f: FeedbackDTO) {
    try {
      await api.post(`/api/admin/feedback/${f.id}`, { done: !f.done });
      setData((list) => (list ?? []).filter((x) => x.id !== f.id));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  return (
    <>
      <AdminHeader title="Feedback">What people sent from Help &amp; feedback in the apps. Child safety concerns come first: act on them straight away.</AdminHeader>
      <div className="mb-4 flex gap-2">
        {[false, true].map((d) => (
          <button key={String(d)} type="button" onClick={() => setDone(d)} className={cx("h-8 rounded-full border px-3.5 text-sm font-semibold", done === d ? "border-ink bg-ink text-canvas" : "border-line")}>
            {d ? "Done" : "Open"}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <RowSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon="message" title={done ? "Nothing closed yet" : "Nothing waiting"} compact />
      ) : (
        <ul className="space-y-3">
          {data.map((f) => (
            <li key={f.id} className={cx("rounded-card border bg-surface p-4", f.kind === "safety" && !f.done ? "border-danger" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2">
                <ProfileTrigger handle={f.user.handle} className="flex items-center gap-2">
                  <Avatar name={f.user.displayName} src={f.user.avatarUrl} size={28} />
                  <span className="text-sm font-semibold">{f.user.displayName}</span>
                  <span className="font-mono text-[12px] text-ink-muted">@{f.user.handle}</span>
                </ProfileTrigger>
                <span className={cx("rounded-full border px-2 py-0.5 text-[12px] font-semibold", f.kind === "safety" ? "border-danger text-danger" : "border-line text-ink-muted")}>{KIND[f.kind]}</span>
                <span className="ml-auto text-[12px] text-ink-muted">
                  {formatDateShort(f.createdAt)}
                  {f.source ? ` · ${f.source}` : ""}
                </span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap break-words">{f.message}</p>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={() => void mark(f)}>
                  {f.done ? "Open again" : "Mark as done"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdminFeedbackPage() {
  return (
    <AdminGate>
      <FeedbackContent />
    </AdminGate>
  );
}
