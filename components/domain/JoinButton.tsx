"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { TextArea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LIMITS } from "@/lib/constants";
import type { CommunityCardDTO } from "@/lib/types";

/**
 * Join / request / cancel-request for a COMMUNITY card.
 *  - public            → joins immediately
 *  - private           → "Request to join" (optional note to the admins) — never a back door
 *  - request pending   → click to cancel it
 *  - already a member  → shows "Joined" (leaving lives on the community page)
 *  - not enough points → "Needs N points", which explains how points are earned (site admins never need any)
 * The server decides what's allowed; this only reflects the result.
 */
export function JoinButton({
  community,
  onChange,
  iconOnly,
  size = "sm",
}: {
  community: CommunityCardDTO;
  onChange: (next: CommunityCardDTO) => void;
  iconOnly?: boolean;
  size?: "sm" | "md";
}) {
  const { requireAuth, user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [short, setShort] = useState(false);
  const [note, setNote] = useState("");
  const v = community.viewer;

  async function join(message?: string) {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = (await SpaceService.join(community.slug, undefined, message ? { message } : {})).data;
      const joined = res.status === "joined" || res.status === "already_member";
      onChange({
        ...community,
        locked: joined ? false : community.locked,
        memberCount: joined && typeof community.memberCount === "number" && res.status === "joined" ? community.memberCount + 1 : community.memberCount,
        viewer: { ...v, isMember: joined, role: joined ? (v.role ?? "member") : v.role, pendingRequest: res.status === "requested" || res.status === "already_requested", canView: joined || v.canView, canPost: joined || v.canPost },
      });
      toast(res.message, "success");
      setAsking(false);
      setNote("");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    try {
      await SpaceService.leave(community.slug);
      onChange({ ...community, viewer: { ...v, pendingRequest: false } });
      toast("Request cancelled");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (v.isMember) {
    return iconOnly ? (
      <span role="img" aria-label="Joined" className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink">
        <Icon name="check" size={16} />
      </span>
    ) : (
      <Button size={size} disabled className="!opacity-100">
        <Icon name="check" size={14} /> Joined
      </Button>
    );
  }

  if (v.pendingRequest) {
    return iconOnly ? (
      <button type="button" onClick={cancelRequest} disabled={busy} aria-label="Request pending — cancel" title="Request pending — tap to cancel" className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted hover:bg-raised">
        <Icon name="clock" size={16} />
      </button>
    ) : (
      <Button size={size} onClick={cancelRequest} loading={busy} title="Tap to cancel your request">
        <Icon name="clock" size={14} /> Requested
      </Button>
    );
  }

  const need = community.minPointsJoin;
  const have = user?.points ?? 0;
  if (need > 0 && user && !user.isAdmin && have < need) {
    return (
      <>
        {iconOnly ? (
          <button type="button" onClick={() => setShort(true)} aria-label={`Needs ${need} points to join`} title={`Needs ${need} points to join`} className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition hover:bg-raised">
            <Icon name="lock" size={16} />
          </button>
        ) : (
          <Button size={size} onClick={() => setShort(true)} title={`You have ${have.toLocaleString("en-NG")} points`}>
            <Icon name="lock" size={14} /> Needs {need.toLocaleString("en-NG")} points
          </Button>
        )}
        <PointsLocked open={short} onClose={() => setShort(false)} need={need} have={have} what={`to join ${community.name}`} />
      </>
    );
  }

  const isPrivate = community.privacy === "private";
  const click = () => (isPrivate ? (requireAuth() ? setAsking(true) : undefined) : join());

  return (
    <>
      {iconOnly ? (
        <button type="button" onClick={click} disabled={busy} aria-label={isPrivate ? `Request to join ${community.name}` : `Join ${community.name}`} className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:bg-raised active:scale-95 disabled:opacity-50">
          <Icon name={isPrivate ? "lock" : "plus"} size={16} />
        </button>
      ) : (
        <Button size={size} variant="primary" onClick={click} loading={busy}>
          {isPrivate ? (
            <>
              <Icon name="lock" size={14} /> Request to join
            </>
          ) : (
            <>
              <Icon name="plus" size={14} /> Join
            </>
          )}
        </Button>
      )}

      <Modal open={asking} onClose={() => setAsking(false)} title={`Request to join ${community.name}`} description="This community is private. An admin will review your request.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void join(note.trim() || undefined);
          }}
          className="space-y-4"
        >
          <TextArea label="Say hi (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.requestMessage} counter={LIMITS.requestMessage} placeholder="Why you'd like to join, who you know here…" />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Send request
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** "Needs 200 points to join": a chip for a community's card while you're not in it. */
export function PointsNeededChip({ need, className }: { need: number; className?: string }) {
  if (!need) return null;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11.5px] font-semibold text-ink-muted", className)}>
      <Icon name="asterisk" size={11} className="text-accent-text" /> Needs {need.toLocaleString("en-NG")} points to join
    </span>
  );
}

/** Not enough points yet: how many you have, how many it takes, and how to earn them. Friendly, never a dead end. */
export function PointsLocked({ open, onClose, need, have, what }: { open: boolean; onClose: () => void; need: number; have: number; what: string }) {
  const pct = Math.min(100, Math.round((have / need) * 100));
  return (
    <Modal open={open} onClose={onClose} title={`Needs ${need.toLocaleString("en-NG")} points`} description={`This community asks for ${need.toLocaleString("en-NG")} points ${what}. You have ${have.toLocaleString("en-NG")}.`} size="sm">
      <div className="space-y-4">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={have} aria-label="Your points">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-[12px] text-ink-muted">
            {have.toLocaleString("en-NG")} / {need.toLocaleString("en-NG")} · {(need - have).toLocaleString("en-NG")} to go
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold">Points come from other people</p>
          <ul className="space-y-1 text-[13px] text-ink-muted">
            <li>· Upvotes on your posts and board posts</li>
            <li>· Good reactions to your messages in community and group chats</li>
            <li>· Going to events (the host ticks you off), with a crew for a bit more</li>
            <li>· People coming to events you host</li>
          </ul>
          <p className="mt-2 text-[12px] text-ink-muted">They can&apos;t be bought.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button href="/settings?tab=hype">Your points</Button>
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
