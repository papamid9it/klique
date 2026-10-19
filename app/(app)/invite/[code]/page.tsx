"use client";

import { placeLabel } from "@/lib/places";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { InviteService } from "@/app/services/InviteService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { getInterest } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";

const REASONS: Record<string, { title: string; body: string }> = {
  expired: { title: "This invite has expired", body: "Ask the person who sent it for a fresh link." },
  revoked: { title: "This invite was revoked", body: "An admin turned this link off. Ask them for a new one." },
  used_up: { title: "This invite has been used up", body: "It reached its maximum number of uses. Ask for a new link." },
  not_found: { title: "We couldn't find that invite", body: "Check the link, or ask the person who sent it." },
};

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useAuth();
  const { data, loading, error, reload } = useApi(() => InviteService.preview(code), [code]);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = (await InviteService.accept(code)).data;
      toast(res.message || "You're in", "success");
      router.push(res.parentSlug ? `/communities/${res.parentSlug}/groups/${res.slug}` : `/communities/${res.slug}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      {loading ? (
        <div role="status" aria-label="Loading invite" className="space-y-3 rounded-card border border-line bg-surface p-6">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error || !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data.valid || !data.target ? (
        <EmptyState icon="link" title={(REASONS[data.reason ?? "not_found"] ?? REASONS.not_found).title} action={<Button href="/communities" variant="primary">Browse communities</Button>}>
          {(REASONS[data.reason ?? "not_found"] ?? REASONS.not_found).body}
        </EmptyState>
      ) : (
        <section className="rounded-card border border-line bg-surface p-6 text-center">
          <span className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-raised text-accent-text">
            <Icon name="users" size={22} />
          </span>
          <p className="eyebrow">You&apos;re invited to {data.target.kind === "subcommunity" ? "a group" : "a community"}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{data.target.name}</h1>
          {data.target.parentName && <p className="mt-1 text-sm text-ink-muted">Part of {data.target.parentName}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Chip>{getInterest(data.target.interest).name}</Chip>
            <Chip>{placeLabel(data.target)}</Chip>
          </div>
          <div className="mt-6">
            {data.alreadyMember ? (
              <>
                <p className="mb-3 text-sm text-ink-muted">You&apos;re already a member.</p>
                <Button variant="primary" href={data.target.parentSlug ? `/communities/${data.target.parentSlug}/groups/${data.target.slug}` : `/communities/${data.target.slug}`}>
                  Open {data.target.name}
                </Button>
              </>
            ) : (
              <Button variant="primary" size="lg" onClick={accept} loading={busy}>
                Accept invite
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">You&apos;ll need an account to join. It only takes a minute.</p>
        </section>
      )}
    </div>
  );
}
