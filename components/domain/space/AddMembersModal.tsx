"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/cx";
import { LIMITS } from "@/lib/constants";
import { useApi, useDebounced } from "@/lib/hooks/useApi";
import type { UserBrief } from "@/lib/types";

/** Pick people from the community to add to a private group (up to LIMITS.groupMembers in total). */
export function AddMembersModal({ slug, subSlug, groupName, communityName, memberCount, onClose, onAdded }: { slug: string; subSlug: string; groupName: string; communityName: string; memberCount: number; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const [picked, setPicked] = useState<UserBrief[]>([]);
  const [busy, setBusy] = useState(false);
  const { data, loading, error } = useApi(() => SubcommunityService.addable(slug, subSlug, query), [slug, subSlug, query]);
  const room = Math.max(0, LIMITS.groupMembers - memberCount);
  const left = room - picked.length;
  const has = (u: UserBrief) => picked.some((p) => p.id === u.id);

  function toggle(u: UserBrief) {
    if (has(u)) setPicked((list) => list.filter((p) => p.id !== u.id));
    else if (left > 0) setPicked((list) => [...list, u]);
  }

  async function add() {
    setBusy(true);
    try {
      const { data: r } = await SubcommunityService.addMembers(slug, subSlug, picked.map((p) => p.id));
      toast(r.added === 1 ? `Added ${picked[0].displayName}` : `Added ${r.added} people`, "success");
      onAdded();
      onClose();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Add people to ${groupName}`} description={`Only members of ${communityName} can be added. Groups hold up to ${LIMITS.groupMembers} people.`}>
      <div className="space-y-4">
        <p className={cx("rounded-control border px-3 py-2 text-[13px]", room === 0 ? "border-danger/30 bg-danger/5 text-danger" : "border-line bg-raised/60 text-ink-muted")}>
          {room === 0 ? `This group is full (${LIMITS.groupMembers} people). Remove someone to make room.` : `${memberCount} of ${LIMITS.groupMembers} people · room for ${left} more${picked.length ? ` after these ${picked.length}` : ""}`}
        </p>

        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((u) => (
              <button key={u.id} type="button" onClick={() => toggle(u)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-raised pr-2.5 pl-1 text-[13px]" aria-label={`Remove ${u.displayName}`}>
                <Avatar name={u.displayName} src={u.avatarUrl} size={22} /> {u.displayName} <Icon name="x" size={12} />
              </button>
            ))}
          </div>
        )}

        <label className="relative block">
          <span className="sr-only">Search the community</span>
          <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${communityName} by name or @handle`} autoFocus className="h-10 w-full rounded-full border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
        </label>

        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-busy={loading}>
          {error ? (
            <li className="px-1 py-3 text-sm text-danger">{error}</li>
          ) : loading && !data ? (
            <li className="px-1 py-3 text-sm text-ink-muted">Searching…</li>
          ) : !(data ?? []).length ? (
            <li className="px-1 py-3 text-sm text-ink-muted">{query ? "Nobody in the community matches that, or they're already in the group." : "Everyone in the community is already in this group."}</li>
          ) : (
            (data ?? []).map((u) => {
              const on = has(u);
              return (
                <li key={u.id}>
                  <button type="button" role="checkbox" aria-checked={on} disabled={!on && left <= 0} onClick={() => toggle(u)} className={cx("flex w-full items-center gap-3 rounded-control p-2 text-left transition disabled:opacity-40", on ? "bg-raised" : "hover:bg-raised/60")}>
                    <Avatar name={u.displayName} src={u.avatarUrl} frame={u.avatarFrame} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-muted">@{u.handle}</span>
                    </span>
                    <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>{on && <Icon name="check" size={12} />}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void add()} loading={busy} disabled={!picked.length}>
            {picked.length <= 1 ? "Add" : `Add ${picked.length} people`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
