"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SaveBar, SettingsBlock, SettingsShell, type SettingsGroup } from "@/components/ui/SettingsShell";
import type { CommunityDTO, GroupPolicy } from "@/lib/types";
import { CommunityForm } from "./CommunityForm";
import { InvitesPanel } from "./InvitesPanel";
import { MembersPanel } from "./MembersPanel";
import { MinPointsForm } from "./MinPoints";
import { DonationsSettings, PayoutsSettings } from "@/components/domain/money/CommunityMoney";
import { RequestsPanel } from "./RequestsPanel";
import { ConfirmModal } from "./parts";

export type CommunityTab = "overview" | "groups" | "posts" | "points" | "donations" | "payouts" | "members" | "requests" | "invites" | "privacy" | "delete";
const TITLES: Record<CommunityTab, string> = { overview: "Overview", groups: "Groups & events", posts: "Posts", points: "Points needed", donations: "Donations", payouts: "Payouts", members: "Members", requests: "Join requests", invites: "Invite links", privacy: "Privacy", delete: "Delete community" };

/** Discord-style full-screen community settings. Owners and admins only; the server re-checks every change. */
export function CommunitySettings({ c, tab, onTab, onClose, onChanged }: { c: CommunityDTO; tab: string; onTab: (t: CommunityTab) => void; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const router = useRouter();
  const isOwner = c.viewer.role === "owner";
  const isPrivate = c.privacy === "private";
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [busyPrivacy, setBusyPrivacy] = useState(false);

  const active = ((Object.keys(TITLES) as CommunityTab[]).includes(tab as CommunityTab) ? tab : "overview") as CommunityTab;

  async function setFeed(next: GroupPolicy) {
    try {
      await CommunityService.update(c.slug, { feedPolicy: next });
      toast(next === "off" ? "Posts turned off" : "Posts settings saved", "success");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function setMemberEvents(next: boolean) {
    try {
      await CommunityService.update(c.slug, { memberEvents: next });
      toast(next ? "Members can suggest events" : "Only owners and admins post events now", "success");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function setPolicy(next: GroupPolicy) {
    try {
      await CommunityService.update(c.slug, { groupPolicy: next });
      toast("Group settings saved", "success");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function setPrivacy(next: boolean) {
    setBusyPrivacy(true);
    try {
      await CommunityService.update(c.slug, { privacy: next ? "private" : "public" });
      toast(next ? "Community is now private" : "Community is now public", "success");
      await onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyPrivacy(false);
    }
  }

  const groups: SettingsGroup[] = [
    {
      title: "Community",
      items: [
        { id: "overview", label: "Overview", icon: "sliders" },
        { id: "groups", label: "Groups", icon: "folder" },
        { id: "posts", label: "Posts", icon: "image" },
        // the Klique community never asks for points
        { id: "points", label: "Points needed", icon: "asterisk", hidden: c.official },
        { id: "privacy", label: "Privacy", icon: "lock", hidden: !isOwner },
      ],
    },
    // Klique itself takes no donations
    ...(c.official ? [] : [{ title: "Money", items: [{ id: "donations", label: "Donations", icon: "heart" as const }, { id: "payouts", label: "Payouts", icon: "coin" as const }] }]),
    {
      title: "People",
      items: [
        { id: "members", label: "Members", icon: "users" },
        { id: "requests", label: "Join requests", icon: "userplus", hidden: !isPrivate },
        { id: "invites", label: "Invite links", icon: "link", hidden: !isPrivate },
      ],
    },
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
        </>
      )}

      {active === "groups" && (
        <SettingsBlock title="Who can create groups" intro="Groups are smaller spaces with their own chat channels. Admins can always manage them.">
          <SelectField label="Group creation" value={c.groupPolicy} onChange={(e) => void setPolicy(e.target.value as GroupPolicy)}>
            <option value="admins">Only admins</option>
            <option value="members">Any member</option>
            <option value="off">Nobody (groups off)</option>
          </SelectField>
        </SettingsBlock>
      )}

      {active === "groups" && (
        <SettingsBlock title="Who can post events" intro="Owners and admins post events straight away, from the Events page. A group's own owner and admins can post in their group.">
          <Switch
            checked={c.memberEvents}
            onChange={(v) => void setMemberEvents(v)}
            label="Members can suggest events"
            hint="A member's event waits for you or another admin to approve it (from the event, your notifications or the Dashboard). Nobody else sees it until then."
          />
        </SettingsBlock>
      )}

      {active === "posts" && (
        <SettingsBlock title="Posts" intro="An Instagram-style section of pictures and videos, with up and down votes and comments. Posts also reach members' home feeds.">
          <SelectField label="Who can post" value={c.feedPolicy} onChange={(e) => void setFeed(e.target.value as GroupPolicy)}>
            <option value="off">Nobody (Posts off)</option>
            <option value="admins">Only owners and admins</option>
            <option value="members">Any member</option>
          </SelectField>
        </SettingsBlock>
      )}

      {active === "points" && !c.official && (
        <MinPointsForm
          what="community"
          join={c.minPointsJoin}
          post={c.minPointsPost}
          onSave={async (v) => {
            await CommunityService.update(c.slug, v);
            await onChanged();
          }}
        />
      )}

      {active === "donations" && !c.official && <DonationsSettings slug={c.slug} />}
      {active === "payouts" && !c.official && <PayoutsSettings slug={c.slug} />}

      {active === "members" && <MembersPanel slug={c.slug} />}
      {active === "requests" && <RequestsPanel slug={c.slug} onDecided={onChanged} />}
      {active === "invites" && <InvitesPanel slug={c.slug} spaceName={c.name} />}

      {active === "privacy" && (
        <SettingsBlock title="Access">
          <Switch
            checked={isPrivate}
            onChange={setPrivacy}
            disabled={busyPrivacy}
            label="Private community"
            hint="When on, only members can see posts, events and members, and new people need approval or an invite."
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
