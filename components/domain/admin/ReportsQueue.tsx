"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { PillTabs } from "@/components/layout/PageTitle";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { REPORT_REASONS } from "@/lib/constants";
import { relativeStamp } from "@/lib/format";
import { usePaged } from "@/lib/hooks/useApi";
import type { ReportAction, ReportDTO, ReportStatus } from "@/lib/types";

const STATUSES: { id: ReportStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "reviewing", label: "Reviewing" },
  { id: "actioned", label: "Actioned" },
  { id: "dismissed", label: "Dismissed" },
];
const KIND: Record<ReportDTO["targetType"], string> = {
  user: "Person",
  post: "Group update",
  event: "Event",
  community: "Community",
  subcommunity: "Group",
  channelMessage: "Channel message",
  message: "Direct message",
};
const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

function ReportCard({ r, onDone }: { r: ReportDTO; onDone: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ReportAction | null>(null);
  const [suspendWith, setSuspendWith] = useState<"suspend" | "remove-and-suspend" | null>(null);
  const [note, setNote] = useState("");
  const closed = r.status === "actioned" || r.status === "dismissed";
  const author = r.target.author;

  async function act(action: ReportAction, why = "") {
    setBusy(action);
    try {
      const res = await AdminService.actOnReport(r.id, action, why);
      toast(res.data.status === "dismissed" ? "Report dismissed" : res.data.status === "reviewing" ? "Marked as reviewing" : "Done. Related reports are closed too.", "success");
      setSuspendWith(null);
      onDone(r.id);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">
            {KIND[r.targetType]} · {reasonLabel(r.reason)}
            {r.openCount > 1 && <span className="ml-2 text-danger">{r.openCount} open reports</span>}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold break-words">{r.target.title}</h3>
        </div>
        <span className="font-mono text-[11px] text-ink-muted">{relativeStamp(r.createdAt)}</span>
      </header>

      {(r.target.body || r.target.images.length > 0) && (
        <div className="mt-3 rounded-control border border-line bg-raised p-3">
          {r.target.body && <p className="line-clamp-6 text-sm whitespace-pre-wrap break-words">{r.target.body}</p>}
          {r.target.images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.target.images.slice(0, 4).map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-control border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      {r.target.gone && <p className="mt-3 text-sm text-ink-muted">This has already been deleted.</p>}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <dt className="text-ink-muted">By</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            {author ? (
              <>
                <Avatar name={author.displayName} src={author.avatarUrl} size={22} />
                <Link href={`/people/${author.handle}`} className="truncate hover:underline">
                  @{author.handle}
                </Link>
              </>
            ) : (
              <span className="text-ink-muted">Unknown</span>
            )}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="text-ink-muted">Reported by</dt>
          <dd className="truncate">{r.reporter ? `@${r.reporter.handle}` : "Deleted user"}</dd>
        </div>
      </dl>
      {r.details && <p className="mt-2 text-sm text-ink-muted">&ldquo;{r.details}&rdquo;</p>}

      {!closed && (
        <div className="mt-4 flex flex-wrap gap-2">
          {r.target.href && (
            <Button size="sm" variant="ghost" href={r.target.href}>
              <Icon name="link" size={14} /> Open
            </Button>
          )}
          <Button size="sm" onClick={() => act("dismiss")} loading={busy === "dismiss"} disabled={!!busy}>
            <Icon name="x" size={14} /> Dismiss
          </Button>
          {r.status === "open" && (
            <Button size="sm" variant="ghost" onClick={() => act("reviewing")} loading={busy === "reviewing"} disabled={!!busy}>
              Mark reviewing
            </Button>
          )}
          {r.target.removable && !r.target.gone && (
            <Button size="sm" variant="danger" onClick={() => act("remove")} loading={busy === "remove"} disabled={!!busy}>
              <Icon name="trash" size={14} /> Delete content
            </Button>
          )}
          {author && (
            <Button size="sm" variant="danger" onClick={() => setSuspendWith(r.target.removable && !r.target.gone ? "remove-and-suspend" : "suspend")} disabled={!!busy}>
              <Icon name="ban" size={14} /> Suspend @{author.handle}
            </Button>
          )}
        </div>
      )}

      <Modal open={!!suspendWith} onClose={() => setSuspendWith(null)} title={`Suspend @${author?.handle ?? ""}?`} description="They're signed out everywhere and can't sign in or use Klique until you restore them from the Hosts tab." size="sm">
        <div className="space-y-4">
          <TextArea label="Reason (they won't see it)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={`Reported for ${reasonLabel(r.reason).toLowerCase()}`} />
          {r.target.removable && !r.target.gone && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={suspendWith === "remove-and-suspend"} onChange={(e) => setSuspendWith(e.target.checked ? "remove-and-suspend" : "suspend")} className="accent-[var(--accent-text)]" />
              Also delete the reported content
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSuspendWith(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => suspendWith && act(suspendWith, note.trim())} loading={busy === suspendWith}>
              Suspend
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}

function List({ status, onChanged }: { status: ReportStatus; onChanged: () => void }) {
  const { items, loading, loadingMore, error, hasMore, loadMore, reload, setItems } = usePaged<ReportDTO>((page) => AdminService.reports(status, page), [status]);
  if (loading) return <Skeleton className="h-48 w-full rounded-card" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (items.length === 0) {
    return (
      <EmptyState icon="flag" title={status === "open" ? "Nothing to review" : "Nothing here"} compact>
        {status === "open" ? "When someone reports a person, post, event or message it shows up here." : "Reports you handle end up here."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((r) => (
        <ReportCard
          key={r.id}
          r={r}
          onDone={() => {
            onChanged();
            // acting closes every open report about the same thing
            void reload();
            setItems((list) => list.filter((x) => x.id !== r.id));
          }}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center">
          <Button onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export function ReportsQueue({ counts, onChanged }: { counts: Record<ReportStatus, number> | null; onChanged: () => void }) {
  const [status, setStatus] = useState<ReportStatus>("open");
  return (
    <div className="space-y-5">
      <PillTabs label="Report status" active={status} onChange={setStatus} items={STATUSES.map((s) => ({ ...s, count: counts?.[s.id] ?? null }))} />
      <List key={status} status={status} onChanged={onChanged} />
    </div>
  );
}
