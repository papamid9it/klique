"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import type { AdminUserDTO } from "@/lib/types";

function UserRow({ u, onChange }: { u: AdminUserDTO; onChange: (u: AdminUserDTO) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");

  async function update(patch: { canHostPublic?: boolean; suspended?: boolean; reason?: string }, ok: string) {
    setBusy(true);
    try {
      const { data } = await AdminService.updateUser(u.id, patch);
      onChange(data);
      toast(ok, "success");
      setSuspending(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={u.displayName} src={u.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {u.displayName}
            {u.isAdmin && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-text">Admin</span>}
            {u.suspended && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">Suspended</span>}
          </p>
          <p className="truncate font-mono text-[11px] text-ink-muted">
            @{u.handle} · {u.email}
          </p>
          {u.suspended && u.suspendedReason && <p className="mt-0.5 text-xs text-ink-muted">Reason: {u.suspendedReason}</p>}
        </div>
        {u.suspended ? (
          <Button size="sm" onClick={() => update({ suspended: false }, `@${u.handle} can use Klique again`)} loading={busy}>
            Restore
          </Button>
        ) : (
          !u.isAdmin && (
            <Button size="sm" variant="danger" onClick={() => setSuspending(true)} disabled={busy}>
              <Icon name="ban" size={14} /> Suspend
            </Button>
          )
        )}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <Switch
          label="Can post public events"
          hint={u.isAdmin ? "Admins always can." : "Events that aren't tied to a community, shown to everyone."}
          checked={u.isAdmin || u.canHostPublic}
          disabled={u.isAdmin || busy}
          onChange={(v) => update({ canHostPublic: v }, v ? `@${u.handle} is now a verified host` : `@${u.handle} is no longer a verified host`)}
        />
      </div>
      <Modal open={suspending} onClose={() => setSuspending(false)} title={`Suspend @${u.handle}?`} description="They're signed out everywhere and can't sign in or use Klique until you restore them." size="sm">
        <div className="space-y-4">
          <TextArea label="Reason (they won't see it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSuspending(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => update({ suspended: true, reason: reason.trim() }, `@${u.handle} is suspended`)}>
              Suspend
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  );
}

export function HostsPanel({ minMembers }: { minMembers: number | null }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const { data, loading, error, reload, setData } = useApi(() => AdminService.users(query), [query]);

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted sm:p-5">
        <p>
          <span className="font-semibold text-ink">Who can post public events:</span> site admins, the verified hosts you turn on here, and owners of a community with {minMembers ?? 100}+ members (no switch needed). Anyone can still host inside a community they run.
        </p>
      </div>
      <TextField label="Find someone" type="search" placeholder="Name, @handle or email" value={q} onChange={(e) => setQ(e.target.value)} hint={query ? undefined : "Showing verified hosts and suspended accounts."} />
      {loading ? (
        <Skeleton className="h-28 w-full rounded-card" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon="users" title={query ? "Nobody matches that" : "No verified hosts yet"} compact>
          {query ? "Try their @handle or email." : "Search for someone to let them post public events."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((u) => (
            <UserRow key={u.id} u={u} onChange={(next) => setData((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))} />
          ))}
        </ul>
      )}
    </div>
  );
}
