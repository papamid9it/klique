"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { SubcommunityService } from "@/app/services/SubcommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SaveBar, SettingsBlock, SettingsShell, type SettingsGroup } from "@/components/ui/SettingsShell";
import { LIMITS } from "@/lib/constants";
import type { SubVisibility, SubcommunityDTO } from "@/lib/types";
import { InvitesPanel } from "./InvitesPanel";
import { MembersPanel } from "./MembersPanel";
import { ConfirmModal, VisibilityPicker } from "./parts";

export type GroupTab = "overview" | "members" | "invites" | "delete";
const TITLES: Record<GroupTab, string> = { overview: "Overview", members: "Members", invites: "Invite links", delete: "Delete group" };

/** Discord-style full-screen group settings. */
export function GroupSettings({ g, tab, onTab, onClose, onChanged }: { g: SubcommunityDTO; tab: string; onTab: (t: GroupTab) => void; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const router = useRouter();
  const parent = g.parent.slug;
  const isOwner = g.viewer.role === "owner";
  const isPrivate = g.visibility === "private";
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description);
  const [visibility, setVisibility] = useState<SubVisibility>(g.visibility);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = name !== g.name || description !== g.description || visibility !== g.visibility;
  const active = ((Object.keys(TITLES) as GroupTab[]).includes(tab as GroupTab) ? tab : "overview") as GroupTab;

  async function save() {
    setBusy(true);
    try {
      const res = await SubcommunityService.update(parent, g.slug, { name: name.trim(), description: description.trim(), ...(isOwner ? { visibility } : {}) });
      toast("Group updated", "success");
      if (res.data.slug !== g.slug) router.replace(`/communities/${parent}?g=${res.data.slug}&settings=overview`);
      else await onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const groups: SettingsGroup[] = [
    {
      title: g.name,
      items: [
        { id: "overview", label: "Overview", icon: "sliders" },
        { id: "members", label: "Members", icon: "users", hidden: g.moderationOnly },
        { id: "invites", label: "Invite links", icon: "link", hidden: !isPrivate },
      ],
    },
    { items: [{ id: "delete", label: "Delete group", icon: "trash", danger: true }] },
  ];

  return (
    <SettingsShell heading="Group settings" groups={groups} active={active} onSelect={(id) => onTab(id as GroupTab)} onClose={onClose} title={TITLES[active]}>
      {active === "overview" && (
        <>
          <div className="space-y-5">
            <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.communityName} required />
            <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.communityDescription} counter={LIMITS.communityDescription} />
            {isOwner ? <VisibilityPicker value={visibility} onChange={setVisibility} /> : <p className="text-xs text-ink-muted">Only the group&apos;s owner can change who can join.</p>}
          </div>
          <SaveBar
            dirty={dirty}
            busy={busy}
            disabled={!name.trim()}
            onReset={() => {
              setName(g.name);
              setDescription(g.description);
              setVisibility(g.visibility);
            }}
            onSave={() => void save()}
          />
        </>
      )}
      {active === "members" && <MembersPanel slug={parent} subSlug={g.slug} />}
      {active === "invites" && <InvitesPanel slug={parent} subSlug={g.slug} spaceName={g.name} />}
      {active === "delete" && (
        <SettingsBlock danger>
          <p className="text-sm font-medium">Delete this group</p>
          <p className="mt-1 mb-4 text-sm text-ink-muted">Removes its channels, messages, events and memberships. The community stays.</p>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={15} /> Delete group
          </Button>
        </SettingsBlock>
      )}
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this group?"
        description="This can't be undone."
        confirmLabel="Delete group"
        requireText={g.name}
        onConfirm={async () => {
          await SubcommunityService.remove(parent, g.slug);
          toast("Group deleted", "success");
          router.replace(`/communities/${parent}`);
        }}
      />
    </SettingsShell>
  );
}
