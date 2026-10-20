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
import type { SubcommunityDTO } from "@/lib/types";
import { MembersPanel } from "./MembersPanel";
import { ConfirmModal } from "./parts";

export type GroupTab = "overview" | "members" | "delete";
const TITLES: Record<GroupTab, string> = { overview: "Overview", members: "Members", delete: "Delete group" };

/** Discord-style full-screen group settings. */
export function GroupSettings({ g, tab, onTab, onClose, onChanged }: { g: SubcommunityDTO; tab: string; onTab: (t: GroupTab) => void; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const router = useRouter();
  const parent = g.parent.slug;
  const canDelete = g.viewer.role === "owner" || !!g.viewer.canModerate;
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = name !== g.name || description !== g.description;
  const active = ((Object.keys(TITLES) as GroupTab[]).includes(tab as GroupTab) ? tab : "overview") as GroupTab;

  async function save() {
    setBusy(true);
    try {
      const res = await SubcommunityService.update(parent, g.slug, { name: name.trim(), description: description.trim() });
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
        { id: "members", label: "Members", icon: "users" },
      ],
    },
    { items: [{ id: "delete", label: "Delete group", icon: "trash", danger: true, hidden: !canDelete }] },
  ];

  return (
    <SettingsShell heading="Group settings" groups={groups} active={active} onSelect={(id) => onTab(id as GroupTab)} onClose={onClose} title={TITLES[active]}>
      {active === "overview" && (
        <>
          <div className="space-y-5">
            <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.communityName} required />
            <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.communityDescription} counter={LIMITS.communityDescription} />
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <Icon name="lock" size={12} /> Private group: only people added from {g.parent.name} can see it, up to {LIMITS.groupMembers}.
            </p>
          </div>
          <SaveBar
            dirty={dirty}
            busy={busy}
            disabled={!name.trim()}
            onReset={() => {
              setName(g.name);
              setDescription(g.description);
            }}
            onSave={() => void save()}
          />
        </>
      )}
      {active === "members" && <MembersPanel slug={parent} subSlug={g.slug} group={{ name: g.name, communityName: g.parent.name, memberCount: g.memberCount ?? 0, canAdd: g.viewer.canManage, onChanged: () => void onChanged() }} />}
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
