"use client";

import { useRouter } from "next/navigation";
import { audienceLabel } from "@/lib/constants";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { useState } from "react";
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

export type CommunityTab = "overview" | "groups" | "posts" | "donations" | "payouts" | "members" | "requests" | "invites" | "screening" | "roles" | "automod" | "welcome" | "emoji" | "modlog" | "webhooks" | "notifications" | "privacy" | "delete";
const TITLES: Record<CommunityTab, string> = { overview: "Overview", groups: "Events and mentions", posts: "Posts", donations: "Donations", payouts: "Payouts", members: "Members", requests: "Join requests", invites: "Invite links", screening: "Entry questions", roles: "Roles", automod: "AutoMod", welcome: "Welcome screen", emoji: "Emoji", modlog: "Moderation log", webhooks: "Webhooks & bots", notifications: "Your notifications", privacy: "Privacy", delete: "Delete community" };

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
  const setMass = (next: boolean) => massSave.run(() => saveTo({ membersMassMention: next }, next ? "Members can mention everyone" : "Only owners and admins can mention everyone"), next);
  const setPrivacy = (next: boolean) => privacySave.run(() => saveTo({ privacy: next ? "private" : "public" }, next ? "Community is now private" : "Community is now public"), next);

  const groups: SettingsGroup[] = [
    {
      title: "Community",
      items: [
        { id: "overview", label: "Overview", icon: "sliders", hidden: !admin },
        { id: "groups", label: "Events and mentions", icon: "calendar", hidden: !admin },
        { id: "posts", label: "Posts", icon: "image", hidden: !admin },
        { id: "privacy", label: "Privacy", icon: "lock", hidden: !isOwner },
        // your own (every member has one; members reach it from the community's menu)
        { id: "notifications", label: "Your notifications", icon: "bell" },
      ],
    },
    // Klique itself takes no donations
    ...(c.official || !admin ? [] : [{ title: "Money", items: [{ id: "donations", label: "Donations", icon: "heart" as const }, { id: "payouts", label: "Payouts", icon: "coin" as const }] }]),
    {
      title: "People",
      items: [
        { id: "members", label: "Members", icon: "users", hidden: !canMembers },
        { id: "roles", label: "Roles", icon: "shield", hidden: !may("manageRoles") },
        { id: "automod", label: "AutoMod", icon: "ban", hidden: !admin },
        { id: "welcome", label: "Welcome screen", icon: "userplus", hidden: !admin },
        { id: "emoji", label: "Emoji", icon: "smile", hidden: !may("manageEmoji") },
        { id: "requests", label: "Join requests", icon: "userplus", hidden: !admin },
        { id: "invites", label: "Invite links", icon: "link", hidden: !isPrivate || !admin },
        // official communities (Klique HQ) take everyone, no questions asked
        { id: "screening", label: "Entry questions", icon: "info", hidden: !!c.official || !admin },
        { id: "modlog", label: "Moderation log", icon: "shield", hidden: !may("viewModLog") },
      ],
    },
    // bots: channel webhooks (the owner only; never in 18+ communities)
    ...(c.adult || !(runsApps || perms.includes("manageWebhooks")) ? [] : [{ title: "Apps", items: [{ id: "webhooks", label: "Webhooks & bots", icon: "link" as const }] }]),
    { items: [{ id: "delete", label: "Delete community", icon: "trash", danger: true, hidden: !isOwner }] },
  ];

  return (
    <SettingsShell heading={c.name} groups={groups} active={active} onSelect={(id) => onTab(id as CommunityTab)} onClose={onClose} title={TITLES[active]}>
      {active === "overview" && (
        <>
          <CommunityForm
            key={formKey}
            embedded={{ formId: "community-form", onDirty: setDirty, onBusy: setSaving }}
            initial={{ name: c.name, description: c.description, interest: c.interest, country: c.country, region: c.region, city: c.city, neighborhood: c.neighborhood, coverImage: c.coverImage ?? "", privacy: c.privacy, adult: c.adult, explicit: c.explicit }}
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
            <SettingsBlock title="Points to join" intro="Points are earned from other people (upvotes, good reactions, showing up to events) and can't be bought. Ask for a minimum to keep out brand-new or spammy accounts.">
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

      {active === "groups" && (
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

      {active === "groups" && (
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
              hint="Points are earned from other people (upvotes, good reactions, showing up to events) and can't be bought. 0 means any member. Below it, members can still chat, use boards, comment, vote and react. Owners and admins never need any."
              value={c.minPointsPost}
              onSave={async (minPointsPost) => {
                await CommunityService.update(c.slug, { minPointsPost });
                await onChanged();
              }}
            />
          )}
        </SettingsBlock>
      )}

      {active === "donations" && !c.official && <DonationsSettings slug={c.slug} />}
      {active === "payouts" && !c.official && <PayoutsSettings slug={c.slug} />}

      {active === "members" && <MembersPanel slug={c.slug} />}
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
      {active === "webhooks" && !c.adult && (runsApps || perms.includes("manageWebhooks")) && <WebhooksPanel slug={c.slug} />}
      {active === "screening" && <ScreeningPanel slug={c.slug} />}
      {active === "requests" && <RequestsPanel slug={c.slug} onDecided={onChanged} />}
      {active === "invites" && <InvitesPanel slug={c.slug} spaceName={c.name} />}

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
