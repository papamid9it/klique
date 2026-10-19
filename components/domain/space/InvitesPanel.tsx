"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { absoluteUrl } from "@/components/domain/ShareButton";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SelectField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { formatDateShort, whatsappShareUrl } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { InviteDTO } from "@/lib/types";
import { ConfirmModal } from "./parts";

export function InvitesPanel({ slug, subSlug, spaceName }: { slug: string; subSlug?: string; spaceName: string }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi(() => SpaceService.invites(slug, subSlug), [slug, subSlug]);
  const [days, setDays] = useState("7");
  const [uses, setUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<InviteDTO | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await SpaceService.createInvite(slug, subSlug, {
        expiresInDays: days ? Number(days) : undefined,
        maxUses: uses ? Math.max(1, Number(uses)) : undefined,
      });
      setData((prev) => [res.data, ...(prev ?? [])]);
      toast("Invite link created", "success");
      setUses("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    const url = absoluteUrl(`/invite/${code}`);
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied", "success");
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid items-end gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]">
        <SelectField label="Expires" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="1">After 1 day</option>
          <option value="7">After 7 days</option>
          <option value="30">After 30 days</option>
          <option value="">Never</option>
        </SelectField>
        <TextField label="Max uses (optional)" type="number" min={1} max={1000} inputMode="numeric" value={uses} onChange={(e) => setUses(e.target.value)} placeholder="Unlimited" />
        <Button type="submit" variant="primary" loading={busy} className="h-11">
          <Icon name="link" size={15} /> Create link
        </Button>
      </form>

      {loading ? (
        <RowSkeleton rows={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !(data ?? []).length ? (
        <EmptyState icon="link" title="No invite links yet" compact>
          Create a link and share it on WhatsApp. Anyone who opens it can join {spaceName}.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px] text-ink">/invite/{i.code}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {i.uses}
                  {i.maxUses ? ` / ${i.maxUses}` : ""} used · {i.expiresAt ? `expires ${formatDateShort(i.expiresAt)}` : "never expires"}
                </p>
              </div>
              {i.active ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => copy(i.code)}>
                    <Icon name="copy" size={14} /> Copy
                  </Button>
                  <a
                    href={whatsappShareUrl(`Join ${spaceName} on klique`, absoluteUrl(`/invite/${i.code}`))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-semibold hover:bg-raised"
                  >
                    WhatsApp
                  </a>
                  <Button size="sm" variant="danger" onClick={() => setRevoking(i)}>
                    Revoke
                  </Button>
                </div>
              ) : (
                <Chip>{i.revoked ? "Revoked" : "Inactive"}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke this invite link?"
        description="The link will stop working immediately. People who already joined stay in."
        confirmLabel="Revoke link"
        onConfirm={async () => {
          if (!revoking) return;
          await SpaceService.revokeInvite(slug, revoking.id, subSlug);
          setData((prev) => (prev ?? []).map((x) => (x.id === revoking.id ? { ...x, revoked: true, active: false } : x)));
          toast("Invite revoked", "success");
        }}
      />
    </div>
  );
}
