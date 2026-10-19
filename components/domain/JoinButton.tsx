"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SpaceService } from "@/app/services/SpaceService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
  const { requireAuth } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
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
