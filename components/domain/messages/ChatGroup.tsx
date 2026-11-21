"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { FriendService } from "@/app/services/FriendService";
import { MessageService } from "@/app/services/MessageService";
import { ConfirmModal } from "@/components/domain/space/parts";
import { ProfileTrigger } from "@/components/providers/ProfileCardProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch, TextArea, TextField } from "@/components/ui/Field";
import { ImageField } from "@/components/ui/ImageField";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { RowSkeleton } from "@/components/ui/Skeleton";
import { LIMITS } from "@/lib/constants";
import { useApi } from "@/lib/hooks/useApi";
import type { UserBrief } from "@/lib/types";

/** Tick your friends. Only friends can be added to a group. */
function FriendPicker({ picked, onToggle, leaveOut = [] }: { picked: string[]; onToggle: (id: string) => void; leaveOut?: string[] }) {
  const { data, loading } = useApi(() => FriendService.list(), [], { key: "friends" });
  const [q, setQ] = useState("");
  if (loading && !data) return <RowSkeleton rows={3} />;
  const needle = q.trim().toLowerCase();
  const friends = (data ?? []).map((f) => f.user).filter((u) => !leaveOut.includes(u.id) && (!needle || u.displayName.toLowerCase().includes(needle) || u.handle.includes(needle)));
  return (
    <div className="space-y-2">
      <TextField label="Your friends" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
      {friends.length ? (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {friends.map((u: UserBrief) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 hover:bg-raised">
                <input type="checkbox" checked={picked.includes(u.id)} onChange={() => onToggle(u.id)} className="size-4 shrink-0 accent-[var(--accent-text)]" />
                <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{u.displayName}</span>
                  <span className="block truncate text-xs text-ink-muted">@{u.handle}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-ink-muted">{needle ? "No friends match." : "No friends to add yet."}</p>
      )}
    </div>
  );
}

export function NewChatGroupModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const res = await MessageService.createGroup(name.trim(), picked);
      onClose();
      router.push(`/messages/${res.data.conversation.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="New group" description={`Chat with up to ${LIMITS.chatGroupMembers - 1} of your friends.`} size="sm">
      <div className="space-y-4">
        <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.chatGroupName} autoFocus />
        <FriendPicker picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
        <Button variant="primary" className="w-full" loading={busy} disabled={!name.trim() || picked.length < 2} onClick={() => void create()}>
          {picked.length < 2 ? "Pick at least 2 friends" : `Create with ${picked.length} friends`}
        </Button>
      </div>
    </Modal>
  );
}

/** Who's in a group, and (for whoever started it) adding, removing and renaming. */
export function ChatGroupInfo({ id, onChanged }: { id: string; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { data: g, setData, reload } = useApi(() => MessageService.group(id), [id], { key: `chat-group:${id}` });
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<UserBrief | null>(null);
  const [leaving, setLeaving] = useState(false);
  // editing the photo, name and description together (null: not editing)
  const [draft, setDraft] = useState<{ name: string; image: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!g) return <div className="p-4"><RowSkeleton rows={4} /></div>;
  const me = g.members.find((m) => m.me);

  async function add() {
    setBusy(true);
    try {
      setData((await MessageService.addToGroup(id, picked)).data);
      setPicked([]);
      setAdding(false);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft?.name.trim()) return;
    setSaving(true);
    try {
      setData((await MessageService.editGroup(id, { name: draft.name.trim(), image: draft.image || null, description: draft.description.trim() })).data);
      setDraft(null);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }
  async function setMembersCanEdit(on: boolean) {
    try {
      setData((await MessageService.editGroup(id, { membersCanEdit: on })).data);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-4 p-4">
      {draft ? (
        <div className="space-y-3">
          <ImageField kind="avatar" shape="round" label="Group photo" value={draft.image} onChange={(image) => setDraft({ ...draft, image })} reposition={{ aspect: 1, round: true, title: "Position the group photo", description: "Drag to move it, and pinch, scroll or use the slider to zoom." }} hint="Optional. After choosing one you can move and zoom it to fit the circle." />
          <TextField label="Group name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={LIMITS.chatGroupName} />
          <TextArea label="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={LIMITS.chatGroupDescription} counter={LIMITS.chatGroupDescription} rows={3} placeholder="What's this group for?" />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()} disabled={!draft.name.trim()}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 pt-1 text-center">
            <Avatar name={g.name} src={g.image} size={76} />
            <div className="min-w-0">
              <p className="text-lg font-semibold break-words">{g.name}</p>
              <p className="text-xs text-ink-muted">Group · {g.members.length} of {LIMITS.chatGroupMembers} people</p>
            </div>
            {g.description && <p className="w-full text-sm whitespace-pre-wrap break-words text-ink">{g.description}</p>}
            {g.canEdit && (
              <Button size="sm" onClick={() => setDraft({ name: g.name, image: g.image ?? "", description: g.description })}>
                <Icon name="edit" size={14} /> {g.description || g.image ? "Edit group" : "Add a photo and description"}
              </Button>
            )}
          </div>
          {g.mine && (
            <Switch checked={g.membersCanEdit} onChange={(v) => void setMembersCanEdit(v)} label="Members can edit the group" hint="Change its photo, name and description, and pin messages. Off: only you." />
          )}
        </div>
      )}
      {g.mine && !adding && g.members.length < LIMITS.chatGroupMembers && (
        <Button className="w-full" onClick={() => setAdding(true)}><Icon name="userplus" size={15} /> Add friends</Button>
      )}
      {adding && (
        <div className="space-y-2 rounded-card border border-line p-3">
          <FriendPicker picked={picked} leaveOut={g.members.map((m) => m.user.id)} onToggle={(x) => setPicked((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]))} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!picked.length} onClick={() => void add()}>Add</Button>
          </div>
        </div>
      )}
      <ul className="space-y-0.5">
        {g.members.map((m) => (
          <li key={m.user.id} className="flex items-center gap-2">
            <ProfileTrigger handle={m.user.handle} className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-1.5 py-1.5 text-left hover:bg-raised">
              <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.user.displayName}{m.me ? " (you)" : ""}</span>
                <span className="block truncate text-xs text-ink-muted">{m.owner ? "Started this group" : `@${m.user.handle}`}</span>
              </span>
            </ProfileTrigger>
            {g.mine && !m.me && (
              <button type="button" aria-label={`Remove ${m.user.displayName}`} title="Remove" onClick={() => setRemoving(m.user)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-danger">
                <Icon name="x" size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {me && <Button variant="danger" className="w-full" onClick={() => setLeaving(true)}><Icon name="logout" size={15} /> Leave group</Button>}
      <ConfirmModal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.displayName ?? ""}?`} description="They leave the group, and they'll be told." confirmLabel="Remove" onConfirm={async () => {
        await MessageService.removeFromGroup(id, removing!.id);
        void reload();
        onChanged();
      }} />
      <ConfirmModal open={leaving} onClose={() => setLeaving(false)} title={`Leave ${g.name}?`} description={g.mine ? "Someone else will run the group after you." : "Only the person who started it can add you back."} confirmLabel="Leave" onConfirm={async () => {
        await MessageService.removeFromGroup(id, me!.user.id);
        router.push("/messages");
      }} />
    </div>
  );
}
