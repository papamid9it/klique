"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/lib/hooks/useApi";

/** The owner's view of the Verified check: what it asks for, applying, and waiting for an answer. */
export function VerificationBlock({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, setData } = useApi(() => CommunityService.verification(slug), [slug]);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      setData((await CommunityService.applyForVerification(slug)).data);
      toast("Sent. We'll let you know.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsBlock title="Verified badge" intro="A check by your community's name. The Klique team looks at every community by hand: it has to be active, with nothing erotic, criminal or drug-related.">
      {loading && !data ? (
        <Skeleton className="h-24 w-full rounded-control" />
      ) : !data ? null : data.state === "verified" ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon name="check" size={15} className="text-accent-text" /> Your community is verified.
        </p>
      ) : data.state === "pending" ? (
        <p className="flex items-center gap-2 rounded-control border border-line bg-raised px-3 py-2.5 text-sm font-semibold text-ink">
          <Icon name="clock" size={15} className="text-accent-text" /> Pending. We&apos;re checking your community, and we&apos;ll notify you when it&apos;s done.
        </p>
      ) : (
        <div className="space-y-4">
          {data.state === "rejected" && <p className="rounded-control border border-danger/40 px-3 py-2.5 text-sm text-ink">It wasn&apos;t approved last time.{data.note ? ` ${data.note}` : ""} You can apply again.</p>}
          <ul className="space-y-1.5">
            {data.checks.map((x) => (
              <li key={x.id} className={`flex items-center gap-2 text-sm ${x.met ? "text-ink" : "text-ink-muted"}`}>
                <Icon name={x.met ? "check" : "x"} size={14} className={x.met ? "text-accent-text" : "text-ink-muted"} /> {x.label}
              </li>
            ))}
          </ul>
          <Button variant="primary" disabled={!data.canApply} loading={busy} onClick={() => void apply()}>
            Apply to be verified
          </Button>
        </div>
      )}
    </SettingsBlock>
  );
}
