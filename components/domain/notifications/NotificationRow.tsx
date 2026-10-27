"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CrewService } from "@/app/services/CrewService";
import { EventService } from "@/app/services/EventService";
import { InboxService } from "@/app/services/InboxService";
import { SpaceService } from "@/app/services/SpaceService";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { cdn } from "@/lib/cdn";
import { relativeStamp } from "@/lib/format";
import type { NotificationDTO } from "@/lib/types";

/** The faces of who did it: one, or two overlapping for a bundle. A picture or the kind's icon otherwise. */
function Visual({ n, icon }: { n: NotificationDTO; icon: IconName }) {
  const [a, b] = n.actors;
  if (a) {
    return (
      <span className="relative inline-block size-11 shrink-0">
        <Avatar name={a.displayName} src={a.avatarUrl} size={b ? 34 : 44} />
        {b && (
          <span className="absolute right-0 bottom-0 rounded-full ring-2 ring-surface">
            <Avatar name={b.displayName} src={b.avatarUrl} size={26} />
          </span>
        )}
      </span>
    );
  }
  if (n.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cdn(n.image, { w: 96, h: 96, fit: "fill" })} alt="" className="size-11 shrink-0 rounded-control object-cover" />;
  }
  return (
    <span className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full", n.read ? "bg-raised text-ink-muted" : "bg-accent text-accent-ink")}>
      <Icon name={icon} size={18} />
    </span>
  );
}

/** The title with the person's name in bold when it starts with it ("**Ngozi Eze** wants to join your crew"). */
function Title({ n }: { n: NotificationDTO }) {
  const who = n.actors[0]?.displayName;
  if (who && n.title.startsWith(who)) {
    return (
      <>
        <span className="font-semibold text-ink">{who}</span>
        {n.title.slice(who.length)}
      </>
    );
  }
  return <>{n.title}</>;
}

/**
 * One line in Notifications: who did it (faces) or a picture, the words with names in bold, when, and the
 * picture of the event on the right. Join requests answer right here (Accept / Decline), a member's event can be
 * approved (turning one down needs a reason, so that's on the event) and event news has Going. On hover: mark read or unread, and remove.
 */
export function NotificationRow({ n, now, icon, kind, onOpen, onPatch, onRemove }: { n: NotificationDTO; now: Date | null; icon: IconName; kind: string; onOpen: () => void; onPatch: (n: NotificationDTO) => void; onRemove: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const others = n.count > 1 && n.actors[0] ? `${n.actors[0].displayName} and ${n.count - 1} ${n.count - 1 === 1 ? "other" : "others"}` : null;

  async function act(label: string, fn: () => Promise<unknown>, after: string) {
    setBusy(label);
    try {
      await fn();
      setDone(after);
      if (!n.read) {
        onPatch({ ...n, read: true });
        void InboxService.setRead(n.id, true).catch(() => {});
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRead() {
    onPatch({ ...n, read: !n.read });
    try {
      await InboxService.setRead(n.id, !n.read);
    } catch (e) {
      onPatch(n);
      toast(errorMessage(e), "error");
    }
  }

  async function remove() {
    onRemove();
    await InboxService.remove(n.id).catch((e) => toast(errorMessage(e), "error"));
  }

  const a = n.action;
  const actions = done ? (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
      <Icon name="check" size={13} /> {done}
    </span>
  ) : a?.kind === "crewRequest" ? (
    <>
      <Button size="sm" variant="primary" loading={busy === "yes"} onClick={() => void act("yes", () => CrewService.decide(a.crewId, a.userId, true), "Accepted")}>
        Accept
      </Button>
      <Button size="sm" loading={busy === "no"} onClick={() => void act("no", () => CrewService.decide(a.crewId, a.userId, false), "Declined")}>
        Decline
      </Button>
    </>
  ) : a?.kind === "communityRequest" ? (
    <>
      <Button size="sm" variant="primary" loading={busy === "yes"} onClick={() => void act("yes", () => SpaceService.decideRequest(a.slug, a.requestId, "approve"), "Approved")}>
        Approve
      </Button>
      <Button size="sm" loading={busy === "no"} onClick={() => void act("no", () => SpaceService.decideRequest(a.slug, a.requestId, "reject"), "Declined")}>
        Decline
      </Button>
    </>
  ) : a?.kind === "eventReview" ? (
    <>
      <Button size="sm" variant="primary" loading={busy === "approve"} onClick={() => void act("approve", () => EventService.review(a.eventId, "approve"), "Approved")}>
        <Icon name="check" size={13} /> Approve
      </Button>
      <Button size="sm" onClick={onOpen}>
        Review
      </Button>
    </>
  ) : a?.kind === "event" ? (
    <>
      <Button size="sm" variant="primary" loading={busy === "go"} onClick={() => void act("go", () => EventService.rsvp(a.eventId, "going"), "You're going")}>
        <Icon name="check" size={13} /> Going
      </Button>
      <Button size="sm" onClick={onOpen}>
        View
      </Button>
    </>
  ) : null;

  return (
    <li className={cx("group relative border-b border-line last:border-b-0", !n.read && "bg-accent/[0.05]")}>
      {!n.read && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className="flex w-full cursor-pointer items-start gap-3.5 px-4 py-3.5 text-left transition hover:bg-raised/50 sm:px-5"
      >
        <Visual n={n} icon={icon} />
        <div className="min-w-0 flex-1">
          <p className={cx("text-[14px] leading-snug", n.read ? "text-ink-muted" : "text-ink")}>
            <Title n={n} />
          </p>
          {others && <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">{others}</p>}
          {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{n.body}</p>}
          <p className="mt-1 font-mono text-[11px] text-ink-muted">
            {kind} · {now ? relativeStamp(n.updatedAt, now) : ""}
          </p>
          {actions && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
        {n.image && n.actors.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cdn(n.image, { w: 112, h: 112, fit: "fill" })} alt="" className="size-14 shrink-0 rounded-control object-cover" />
        )}
        {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent" aria-label="New" />}
      </div>
      {/* on hover: read / unread, remove */}
      <div className="absolute top-2 right-3 flex gap-1 rounded-full border border-line bg-surface p-0.5 opacity-0 shadow-sm transition group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={() => void toggleRead()} aria-label={n.read ? "Mark as unread" : "Mark as read"} title={n.read ? "Mark as unread" : "Mark as read"} className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
          <Icon name={n.read ? "bell" : "check"} size={13} />
        </button>
        <button type="button" onClick={() => void remove()} aria-label="Remove" title="Remove" className="inline-flex size-7 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-danger">
          <Icon name="x" size={13} />
        </button>
      </div>
    </li>
  );
}
