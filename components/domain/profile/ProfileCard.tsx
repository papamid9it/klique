"use client";

import { ProfileEffect } from "@/components/ui/ProfileEffect";
import { themeStyle } from "@/components/ui/profileTheme";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { MessageService } from "@/app/services/MessageService";
import { ProfileService } from "@/app/services/ProfileService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserName } from "@/components/ui/UserName";
import { LIMITS, PRESENCES, type Presence } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";
import type { ProfileView } from "@/lib/types";
import { PresenceDot, ProfileActions, ProfileBanner } from "./ProfileParts";

/** The little points pill next to a handle. */
export function PointsPill({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-ink" title="Earned by hosting, showing up and good reactions from others">
      <Icon name="asterisk" size={11} className="text-accent-text" /> {n.toLocaleString("en-NG")} points
    </span>
  );
}

/**
 * The profile popout (Discord's, first click on a name or picture): banner, picture with their status, name in
 * its style, points, a few lines of bio, and a "Message @name" box. The picture, the banner or "View full profile"
 * opens the full profile (ProfileModal).
 */
export function ProfileCard({ handle, onClose, onExpand }: { handle: string; onClose: () => void; onExpand: () => void }) {
  const { data: view, loading, status, setData, reload } = useApi(() => ProfileService.get(handle), [handle], { key: `profile:${handle}` });

  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (!view) {
    return (
      <div className="p-5 text-sm text-ink-muted">
        <p className="font-semibold text-ink">{status === 404 ? "Person not found" : "Couldn't load this profile"}</p>
        <p className="mt-1">{status === 404 ? `Nobody goes by @${handle}.` : "Try again in a moment."}</p>
      </div>
    );
  }

  const p = view.profile;
  return (
    // their theme tints the card, their effect plays over it
    <div className="relative" style={themeStyle(p.profileTheme)}>
      <ProfileEffect id={p.profileEffect} />
      <button type="button" onClick={onExpand} aria-label={`Open ${p.displayName}'s full profile`} className="relative block w-full">
        <ProfileBanner handle={p.handle} bannerUrl={p.bannerUrl} bannerColor={p.bannerColor} className="h-[60px]" />
      </button>
      <div className="relative px-4 pb-4">
        <button type="button" onClick={onExpand} aria-label={`Open ${p.displayName}'s full profile`} className="relative -mt-10 block rounded-full bg-surface p-1.5">
          <Avatar name={p.displayName} src={p.avatarUrl} frame={p.avatarFrame} size={80} />
          <PresenceDot presence={p.presence} className="right-1.5 bottom-1.5 size-[18px]" />
        </button>
        <h2 className="mt-2 text-lg leading-tight font-semibold tracking-[-0.02em] break-words">
          <UserName name={p.displayName} effect={p.nameEffect} />
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-muted">
          <span className="font-mono text-xs">@{p.handle}</span>
          {p.pronouns && <span>· {p.pronouns}</span>}
          <PointsPill n={p.points} />
        </p>
        {view.visible && p.bio && <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
        {!view.visible && <p className="mt-3 text-[13px] text-ink-muted">{view.hiddenReason === "members" ? "Only people who share a community with them can see more." : "This profile is private."}</p>}

        {view.isSelf ? <SelfActions view={view} onSaved={(presence) => setData((d) => (d ? { ...d, profile: { ...d.profile, presence } } : d))} onClose={onClose} /> : <OtherActions view={view} onFriendship={(friendship) => setData((d) => (d ? { ...d, friendship } : d))} onReload={() => void reload()} onClose={onClose} />}

        <button type="button" onClick={onExpand} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:underline">
          View full profile <Icon name="arrow-up-right" size={12} />
        </button>
      </div>
    </div>
  );
}

/** Someone else: "Message @name" (Enter sends a DM and opens it), add friend, and ⋯ (block, report). */
function OtherActions({ view, onFriendship, onReload, onClose }: { view: ProfileView; onFriendship: Parameters<typeof ProfileActions>[0]["onFriendship"]; onReload: () => void; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const p = view.profile;

  async function send() {
    const body = text.trim();
    if (!body || busy || !requireAuth()) return;
    setBusy(true);
    try {
      const convo = await MessageService.start(p.handle, body); // opens (or finds) the conversation and sends it
      setText("");
      onClose();
      router.push(`/messages/${convo.data.conversation.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3.5 flex items-center gap-1.5">
      {view.messaging.allowed ? (
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Message @{p.handle}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={LIMITS.messageBody}
            disabled={busy}
            placeholder={`Message @${p.handle}`}
            className="h-9 w-full rounded-control border border-line bg-raised px-3 text-[13px] text-ink placeholder:text-ink-muted/80 focus:border-accent-text disabled:opacity-60"
          />
        </label>
      ) : (
        <p className="min-w-0 flex-1 truncate text-[12px] text-ink-muted" title={view.messaging.message ?? undefined}>
          <Icon name="lock" size={12} className="mr-1 inline" /> {view.messaging.message ?? "You can't message them."}
        </p>
      )}
      <ProfileActions view={view} layout="popout" onFriendship={onFriendship} onReload={onReload} onNavigate={onClose} />
    </div>
  );
}

/** You: Edit profile, and set your status (the dot on your picture). */
function SelfActions({ view, onSaved, onClose }: { view: ProfileView; onSaved: (p: Presence) => void; onClose: () => void }) {
  const toast = useToast();
  const { user, setUser } = useAuth();
  const current = view.profile.presence;
  async function set(presence: Presence) {
    try {
      const res = await ProfileService.updateMe({ presence });
      onSaved(presence);
      if (user) setUser({ ...user, ...res.data });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  return (
    <div className="mt-3.5 flex items-center gap-2">
      <Button variant="primary" size="sm" href="/settings#profile" onClick={onClose} className="flex-1">
        <Icon name="edit" size={14} /> Edit profile
      </Button>
      <Dropdown
        label="Set your status"
        align="right"
        width={200}
        items={[{ type: "label", label: "Set your status" }, ...PRESENCES.map((s) => ({ label: s.label, hint: s.id === current ? "Current" : undefined, onSelect: () => void set(s.id) }))]}
        trigger={({ props }) => (
          <button {...props} className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12.5px] font-semibold hover:bg-raised">
            <span className="relative size-2.5">
              <PresenceDot presence={current} className="inset-0 size-2.5 ring-0" />
              {current === "invisible" && <span className="absolute inset-0 rounded-full border-2 border-ink-muted" />}
            </span>
            {PRESENCES.find((s) => s.id === current)?.label}
            <Icon name="chevron-down" size={12} />
          </button>
        )}
      />
    </div>
  );
}
