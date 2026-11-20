"use client";
import { usePayments } from "@/lib/hooks/usePayments";

import { useRouter } from "next/navigation";
import { audienceLabel } from "@/lib/constants";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { useEffect, useState } from "react";
import { SpaceService } from "@/app/services/SpaceService";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SaveBar, SettingsBlock, SettingsShell, type SettingsGroup } from "@/components/ui/SettingsShell";
import type { CommunityDTO, GroupPolicy } from "@/lib/types";
import { CommunityForm } from "./CommunityForm";
import { InvitesPanel } from "./InvitesPanel";
import { MembersPanel } from "./MembersPanel";
import { MinPointField } from "./MinPoints";
import { DonationsSettings, PayoutsSettings } from "@/components/domain/money/CommunityMoney";
import { RequestsPanel } from "./RequestsPanel";
import { ConfirmModal } from "./parts";
import { ModLogPanel } from "./ModLogPanel";
import { ScreeningPanel } from "./ScreeningPanel";
import { WebhooksPanel } from "./WebhooksPanel";
import { CommunityNotifySettings } from "./CommunityNotifySettings";
import { RolesPanel } from "./RolesPanel";
import { AutoModPanel } from "./AutoModPanel";
import { VerificationBlock } from "./VerificationBlock";
import { WelcomePanel } from "./Welcome";
import { EmojiPanel } from "./EmojiPanel";

export type CommunityTab = "overview" | "joining" | "events" | "kliques" | "mentions" | "groups" | "posts" | "donations" | "payouts" | "members" | "requests" | "invites" | "screening" | "roles" | "automod" | "welcome" | "emoji" | "modlog" | "webhooks" | "notifications" | "privacy" | "delete" | "sections";
const TITLES: Record<CommunityTab, string> = {
  overview: "Name, picture and description", joining: "Who can join", welcome: "Welcome message", posts: "Posts and board", events: "Events", kliques: "Kliques",
  members: "Members", roles: "Roles and permissions", automod: "Auto-filters", mentions: "Who can ping everyone", modlog: "Removed content log", emoji: "Custom emoji",
  webhooks: "Bots and connections", donations: "Donations", payouts: "Payouts", requests: "Join requests", delete: "Delete community",
  // older links still open
  groups: "Events and mentions", sections: "Board and kliques", privacy: "Privacy", invites: "Invite links", screening: "Questions for new members", notifications: "Your notifications",
};

/** Discord-style full-screen community settings. Owners and admins only; the server re-checks every change. */
export function CommunitySettings({ c, tab, onTab, onClose, onChanged }: { c: CommunityDTO; tab: string; onTab: (t: CommunityTab) => void; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const router = useRouter();
  const isOwner = c.viewer.role === "owner";
  const { user } = useAuth();
  // webhooks (bots) are the owner's to manage (and site admins')
  const runsApps = isOwner || !!user?.isAdmin;
  const isPrivate = c.privacy === "private";
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // owners and admins see everything; a role with moderation powers sees just its tools
  const admin = c.viewer.canManage;
  const perms = c.viewer.perms ?? [];
  const may = (p: string) => admin || perms.includes(p as never);
  const canMembers = admin || ["kick", "ban", "timeout", "manageRoles"].some((p) => perms.includes(p as never));
  const requested = ((Object.keys(TITLES) as CommunityTab[]).includes(tab as CommunityTab) ? tab : "overview") as CommunityTab;
  const allowed = (t: CommunityTab) =>
    t === "notifications" || (t === "members" && canMembers) || (t === "roles" && may("manageRoles")) || (t === "emoji" && may("manageEmoji")) || (t === "modlog" && may("viewModLog")) || (t === "webhooks" && (runsApps || perms.includes("manageWebhooks"))) || admin;
  const active: CommunityTab = allowed(requested) ? requested : canMembers ? "members" : may("viewModLog") ? "modlog" : may("manageEmoji") ? "emoji" : "notifications";

  // settings that save the moment they change: a spinner in the field while saving, then "Saved" (useAutoSave)
  const feedSave = useAutoSave<GroupPolicy>();
  const eventsSave = useAutoSave<boolean>();
  const massSave = useAutoSave<boolean>();
  const onlineSave = useAutoSave<boolean>();
  const boardsSave = useAutoSave<boolean>();
  const kliquesSave = useAutoSave<boolean>();
  const privacySave = useAutoSave<boolean>();
  const saveTo = async (patch: Parameters<typeof CommunityService.update>[1], done: string) => {
    try {
      await CommunityService.update(c.slug, patch);
      toast(done, "success");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
      throw e;
    }
  };
  const setFeed = (next: GroupPolicy) => feedSave.run(() => saveTo({ feedPolicy: next }, next === "off" ? "Posts turned off" : "Posts settings saved"), next);
  const setMemberEvents = (next: boolean) => eventsSave.run(() => saveTo({ memberEvents: next }, next ? "Members can suggest events" : "Only owners and admins post events now"), next);
  const setBoards = (next: boolean) => boardsSave.run(() => saveTo({ boardsOn: next }, next ? "Board turned on" : "Board turned off"), next);
  const setKliques = (next: boolean) => kliquesSave.run(() => saveTo({ kliquesOn: next }, next ? "Kliques turned on" : "Kliques turned off"), next);
  const setOnline = (next: boolean) => onlineSave.run(() => saveTo({ showOnline: next }, next ? "The member list shows who's online" : "Who's online is hidden"), next);
  const setMass = (next: boolean) => massSave.run(() => saveTo({ membersMassMention: next }, next ? "Members can mention everyone" : "Only owners and admins can mention everyone"), next);
  const setPrivacy = (next: boolean) => privacySave.run(() => saveTo({ privacy: next ? "private" : "public" }, next ? "Community is now private" : "Community is now public"), next);

  const donationsOn = !!usePayments()?.donations;
  // people waiting to be let in: shown first, with a count, like the app
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!admin || !isPrivate) return void setWaiting(0);
    let on = true;
    SpaceService.requests(c.slug).then((r) => on && setWaiting(r.data.length), () => {});
    return () => void (on = false);
  }, [admin, isPrivate, c.slug, active]);
  // the same groups, names and explanations as the app's settings (components/settings/groups.ts there)
  const groups: SettingsGroup[] = [
    { title: "Needs your attention", items: [{ id: "requests", label: "Join requests", icon: "userplus", hint: "People waiting to be let in", count: waiting, hidden: !admin || !waiting }] },
    {
      title: "Your community",
      items: [
        { id: "overview", label: "Name, picture and description", icon: "edit", hint: "How it looks to everyone", hidden: !admin },
        { id: "joining", label: "Who can join", icon: "lock", hint: isPrivate ? "Private: approvals, invite links, questions" : "Public or private, questions for new members", hidden: !admin },
        { id: "welcome", label: "Welcome message", icon: "heart", hint: "What new members see first", hidden: !admin },
      ],
    },
    {
      title: "What's inside",
      items: [
        { id: "posts", label: "Posts and board", icon: "image", hint: "Photos, the board, and who can post", hidden: !admin },
        { id: "events", label: "Events", icon: "calendar", hint: "Who can suggest events", hidden: !admin },
        { id: "kliques", label: "Kliques", icon: "pin", hint: "Going out together, on or off", hidden: !admin },
      ],
    },
    {
      title: "Members",
      items: [
        { id: "members", label: "Members", icon: "users", hint: "See everyone, remove or ban", hidden: !canMembers },
        { id: "roles", label: "Roles and permissions", icon: "shield", hint: "Admins, moderators and what they can do", hidden: !may("manageRoles") },
      ],
    },
    {
      title: "Keeping it safe",
      items: [
        { id: "automod", label: "Auto-filters", icon: "ban", hint: "Block links, bad words and spam", hidden: !admin },
        { id: "mentions", label: "Who can ping everyone", icon: "megaphone", hint: "@everyone and @here", hidden: !admin },
        { id: "modlog", label: "Removed content log", icon: "topics", hint: "What was removed, and by whom", hidden: !may("viewModLog") },
      ],
    },
    // Klique itself takes no donations; donations and payouts only while they're switched on (Admin → System)
    ...(c.official || !admin || !donationsOn ? [] : [{ title: "Money", items: [{ id: "donations", label: "Donations", icon: "heart" as const, hint: "Let members support the community" }, { id: "payouts", label: "Payouts", icon: "coin" as const, hint: "Where the money goes" }] }]),
    {
      title: "Extras",
      items: [
        { id: "emoji", label: "Custom emoji", icon: "smile", hint: "Your community's own emoji", hidden: !may("manageEmoji") },
        // bots: never in 18+ communities
        { id: "webhooks", label: "Bots and connections", icon: "link", hint: "Auto-posts and slash commands", hidden: !!c.adult || !(runsApps || perms.includes("manageWebhooks")) },
      ],
    },
    // your own (every member has one; members reach it from the community's menu)
    { title: "Just for you", items: [{ id: "notifications", label: "Your notifications", icon: "bell", hint: "What you hear about from here" }] },
    { items: [{ id: "delete", label: "Delete community", icon: "trash", hint: "Removes everything for good", danger: true, hidden: !isOwner }] },
  ];

  return (
    <SettingsShell heading={c.name} groups={groups} active={active} onSelect={(id) => onTab(id as CommunityTab)} onClose={onClose} title={TITLES[active]}>
      {active === "overview" && (
        <>
          <CommunityForm
            key={formKey}
            embedded={{ formId: "community-form", onDirty: setDirty, onBusy: setSaving }}
            initial={{ name: c.name, description: c.description, interest: c.interest, country: c.country, region: c.region, city: c.city, continent: c.continent ?? "", neighborhood: c.neighborhood, coverImage: c.coverImage ?? "", privacy: c.privacy, adult: c.adult, explicit: c.explicit }}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              const res = await CommunityService.update(c.slug, input);
              toast("Community updated", "success");
              setDirty(false);
              if (res.data.slug !== c.slug) router.replace(`/communities/${res.data.slug}?settings=overview`);
              else await onChanged();
            }}
          />
          <SaveBar
            dirty={dirty}
            busy={saving}
            onReset={() => {
              setFormKey((k) => k + 1);
              setDirty(false);
            }}
            onSave={() => (document.getElementById("community-form") as HTMLFormElement | null)?.requestSubmit()}
          />
          {!c.official && (
            <SettingsBlock title="Points to join" intro="Points are earned from other people (love, upvotes, good reactions, showing up to events) and can't be bought. Ask for a minimum to keep out brand-new or spammy accounts.">
              <MinPointField
                label="Minimum points to join"
                hint="0 means anyone. Shown on its card and page. People already in stay in, and owners and admins never need any."
                value={c.minPointsJoin}
                onSave={async (minPointsJoin) => {
                  await CommunityService.update(c.slug, { minPointsJoin });
                  await onChanged();
                }}
              />
            </SettingsBlock>
          )}
          {!c.official && c.viewer.role === "owner" && <VerificationBlock slug={c.slug} />}
        </>
      )}

      {(active === "groups" || active === "events") && (
        <SettingsBlock title="Who can post events" intro="Owners and admins post events straight away, from the Events page. A group's own owner and admins can post in their group.">
          <Switch
            checked={eventsSave.pending ?? c.memberEvents}
            status={eventsSave.status}
            onChange={(v) => void setMemberEvents(v)}
            label="Members can suggest events"
            hint="A member's event waits for you or another admin to approve it (from the event, your notifications or the Dashboard). Nobody else sees it until then."
          />
        </SettingsBlock>
      )}

      {(active === "groups" || active === "mentions") && (
        <SettingsBlock title="Mentions" intro="Like Discord's “Mention @everyone, @here and all roles”. @everyone (or @all) pings everyone who can see the channel; @here (or @channel) only those online now.">
          <Switch
            checked={massSave.pending ?? !!c.membersMassMention}
            status={massSave.status}
            onChange={(v) => void setMass(v)}
            label="Members can use @everyone and @here"
            hint="Off by default. You and your admins always can. Without it, members can still type them, but nobody gets pinged."
          />
        </SettingsBlock>
      )}

      {active === "posts" && (
        <SettingsBlock title="Posts" intro="An Instagram-style section of pictures and videos, with up and down votes and comments. Posts also reach members' home feeds.">
          <SelectField label="Who can post" value={feedSave.pending ?? c.feedPolicy} status={feedSave.status} onChange={(e) => void setFeed(e.target.value as GroupPolicy)}>
            <option value="off">Nobody (Posts off)</option>
            <option value="admins">Only owners and admins</option>
            <option value="members">Any member</option>
          </SelectField>
          {/* the Klique community never asks for points */}
          {!c.official && c.feedPolicy !== "off" && (
            <MinPointField
              label="Minimum points to post"
              hint="Points are earned from other people (love, upvotes, good reactions, showing up to events) and can't be bought. 0 means any member. Below it, members can still chat, use boards, comment, vote and react. Owners and admins never need any."
              value={c.minPointsPost}
              onSave={async (minPointsPost) => {
                await CommunityService.update(c.slug, { minPointsPost });
                await onChanged();
              }}
            />
          )}
        </SettingsBlock>
      )}

      {(active === "posts" || active === "sections") && (
        <SettingsBlock title="Board" intro="Switch it off if this community doesn't use it. Nothing is deleted: switching it back on brings it all back.">
          <Switch
            checked={boardsSave.pending ?? c.boardsOn}
            status={boardsSave.status}
            onChange={(v) => void setBoards(v)}
            label="Board"
            hint="Topics members start and reply to. Off: the board is hidden and nobody can post there."
          />
        </SettingsBlock>
      )}

      {(active === "kliques" || active === "sections") && (
        <SettingsBlock title="Kliques" intro="Small groups going out together. Nothing is deleted when it's off: switching it back on brings it all back.">
          <Switch
            checked={kliquesSave.pending ?? c.kliquesOn}
            status={kliquesSave.status}
            onChange={(v) => void setKliques(v)}
            label="Kliques"
            hint="Small groups members start to do something together. Off: nobody can start one in this community, and its kliques are hidden from everyone but the people in them. Kliques for this community's events still work."
          />
        </SettingsBlock>
      )}

      {active === "donations" && !c.official && donationsOn && <DonationsSettings slug={c.slug} />}
      {active === "payouts" && !c.official && donationsOn && <PayoutsSettings slug={c.slug} />}

      {active === "members" && isOwner && (
        <SettingsBlock title="Who's online" intro="While the community is new, few people may be online at once. You can hide the online count until it grows.">
          <Switch
            checked={onlineSave.pending ?? c.showOnline !== false}
            status={onlineSave.status}
            onChange={(v) => void setOnline(v)}
            label="Show who's online"
            hint="On: the member list shows how many are online and has an Online filter. Only you, your admins and moderators see the member list."
          />
        </SettingsBlock>
      )}
      {active === "members" && <MembersPanel key={String(c.showOnline !== false)} slug={c.slug} />}
      {active === "modlog" && <ModLogPanel slug={c.slug} />}
      {active === "roles" && <RolesPanel slug={c.slug} />}
      {active === "automod" && <AutoModPanel slug={c.slug} />}
      {active === "welcome" && <WelcomePanel slug={c.slug} name={c.name} />}
      {active === "emoji" && <EmojiPanel slug={c.slug} />}
      {active === "notifications" && (
        <SettingsBlock title="Just for you" intro="These only change what you're notified about in this community.">
          <CommunityNotifySettings c={c} onChanged={onChanged} />
        </SettingsBlock>
      )}
      {active === "webhooks" && !c.adult && (runsApps || perms.includes("manageWebhooks")) && <WebhooksPanel slug={c.slug} onWelcome={admin ? () => onTab("welcome") : undefined} />}
      {active === "screening" && <ScreeningPanel slug={c.slug} />}
      {active === "requests" && <RequestsPanel slug={c.slug} onDecided={async () => { setWaiting((n) => Math.max(0, n - 1)); await onChanged(); }} />}
      {active === "invites" && <InvitesPanel slug={c.slug} spaceName={c.name} />}

      {active === "joining" && (
        <>
          {isOwner && (
            <SettingsBlock title="Public or private">
              <Switch
                checked={privacySave.pending ?? isPrivate}
                onChange={(v) => void setPrivacy(v)}
                status={privacySave.status}
                label="Private community"
                disabled={!!audienceLabel(c.audience)}
                hint={audienceLabel(c.audience) ? `This is a ${audienceLabel(c.audience)!.toLowerCase()} community, so it stays private. Who it's for can't be changed.` : "On: only members see posts, events and members, and new people need your OK or an invite link."}
              />
            </SettingsBlock>
          )}
          {isPrivate && (
            <SettingsBlock title="Waiting to join">
              <RequestsPanel slug={c.slug} onDecided={async () => { setWaiting((n) => Math.max(0, n - 1)); await onChanged(); }} />
            </SettingsBlock>
          )}
          {isPrivate && (
            <SettingsBlock title="Invite links" intro="Anyone with a link joins straight away.">
              <InvitesPanel slug={c.slug} spaceName={c.name} />
            </SettingsBlock>
          )}
          {/* official communities (Klique HQ) take everyone, no questions asked */}
          {!c.official && (
            <SettingsBlock title="Questions for new members" intro="Optional. New members answer these before they join.">
              <ScreeningPanel slug={c.slug} />
            </SettingsBlock>
          )}
        </>
      )}

      {active === "privacy" && (
        <SettingsBlock title="Access">
          <Switch
            checked={privacySave.pending ?? isPrivate}
            onChange={(v) => void setPrivacy(v)}
            status={privacySave.status}
            label="Private community"
            disabled={!!audienceLabel(c.audience)}
            hint={audienceLabel(c.audience) ? `This is a ${audienceLabel(c.audience)!.toLowerCase()} community, so it stays private. Who it's for can't be changed.` : "When on, only members can see posts, events and members, and new people need approval or an invite."}
          />
        </SettingsBlock>
      )}

      {active === "delete" && (
        <SettingsBlock danger>
          <p className="text-sm font-medium">Delete this community</p>
          <p className="mt-1 mb-4 text-sm text-ink-muted">Removes the community, its channels, posts and groups for everyone. This can&apos;t be undone.</p>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={15} /> Delete community
          </Button>
        </SettingsBlock>
      )}

      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this community?"
        description="This can't be undone."
        confirmLabel="Delete forever"
        requireText={c.name}
        onConfirm={async () => {
          await CommunityService.remove(c.slug);
          toast("Community deleted", "success");
          router.replace("/communities");
        }}
      />
    </SettingsShell>
  );
}
