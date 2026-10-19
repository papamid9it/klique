"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { SubcommunityDTO } from "@/lib/types";

/** Join an open group (visibility "parent"). Private groups are invite-only, so they show a hint instead. */
export function GroupJoinButton({ group, parentSlug, parentMember, onJoined }: { group: SubcommunityDTO; parentSlug: string; parentMember: boolean; onJoined: () => void }) {
  const { requireAuth } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (group.viewer.isMember) {
    return (
      <Button size="sm" disabled className="!opacity-100">
        <Icon name="check" size={14} /> Joined
      </Button>
    );
  }
  if (group.visibility === "private") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
        <Icon name="lock" size={12} /> Invite-only
      </span>
    );
  }
  if (!parentMember) return null;

  async function join() {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = await SpaceService.join(parentSlug, group.slug);
      toast(res.data.message, "success");
      onJoined();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="primary" onClick={join} loading={busy}>
      <Icon name="plus" size={14} /> Join
    </Button>
  );
}
