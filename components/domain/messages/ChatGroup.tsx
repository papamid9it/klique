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
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { UserBrief } from "@/lib/types";

/** members shown in the panel; the rest are behind "See all" */
const FIRST = 10;

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
  const [allOpen, setAllOpen] = useState(false);
  const [find, setFind] = useState("");
  const [longText, setLongText] = useState(false);
  if (!g) return <div className="p-4"><RowSkeleton rows={4} /></div>;
  const me = g.members.find((m) => m.me);
  const f = find.trim().toLowerCase();
  const matching = f ? g.members.filter((m) => m.user.displayName.toLowerCase().includes(f) || m.user.handle.toLowerCase().includes(f)) : g.members;

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

  const full = g.members.length >= LIMITS.chatGroupMembers;
  const memberRow = (m: (typeof g.members)[number]) => (
    <li key={m.user.id} className="flex items-center gap-2 px-2">
      <ProfileTrigger handle={m.user.handle} className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-1.5 py-2 text-left hover:bg-raised">
        <Avatar name={m.user.displayName} src={m.user.avatarUrl} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{m.me ? "You" : m.user.displayName}</span>
          <span className="block truncate font-mono text-[12px] text-ink-muted">@{m.user.handle}</span>
        </span>
        {m.owner && <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[12px] font-semibold text-ink-muted">Owner</span>}
      </ProfileTrigger>
      {g.mine && !m.me && (
        <button type="button" aria-label={`Remove ${m.user.displayName}`} title="Remove" onClick={() => setRemoving(m.user)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-danger">
          <Icon name="x" size={15} />
        </button>
      )}
    </li>
  );
  const box = "overflow-hidden rounded-[18px] border border-line bg-surface";
  const quick = (icon: "userplus" | "edit", label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick} className={`${box} flex flex-1 flex-col items-center gap-1.5 py-3 text-sm font-semibold transition hover:bg-raised`}>
      <Icon name={icon} size={20} /> {label}
    </button>
  );

  return (
    <div className="space-y-4 p-4">
      {/* who the group is */}
      <div className="flex flex-col items-center gap-1 pt-1 text-center">
        <Avatar name={g.name} src={g.image} size={88} />
        <p className="mt-1.5 text-lg font-bold break-words">{g.name}</p>
        <p className="text-[13px] text-ink-muted">Group · {g.members.length} {g.members.length === 1 ? "member" : "members"}</p>
      </div>

      {draft ? (
        <div className={`${box} space-y-3 p-3.5`}>
          <ImageField kind="avatar" shape="round" label="Group photo" value={draft.image} onChange={(image) => setDraft({ ...draft, image })} reposition={{ aspect: 1, round: true, title: "Position the group photo", description: "Drag to move it, and pinch, scroll or use the slider to zoom." }} hint="Optional. After choosing one you can move and zoom it to fit the circle." />
          <TextField label="Group name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={LIMITS.chatGroupName} />
          <TextArea label="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={LIMITS.chatGroupDescription} counter={LIMITS.chatGroupDescription} rows={3} placeholder="What's this group for?" />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()} disabled={!draft.name.trim()}>Save</Button>
          </div>
        </div>
      ) : (
        <>
          {(g.mine && !full) || g.canEdit ? (
            <div className="flex gap-2">
              {g.mine && !full && quick("userplus", "Add", () => setAdding((v) => !v))}
              {g.canEdit && quick("edit", "Edit", () => setDraft({ name: g.name, image: g.image ?? "", description: g.description }))}
            </div>
          ) : null}
          {g.description ? (
            <div className={`${box} p-3.5`}>
              <p className="eyebrow mb-1">About</p>
              <p className={cx("text-sm whitespace-pre-wrap break-words", !longText && "line-clamp-4")}>{g.description}</p>
              {!longText && g.description.length > 180 && <button type="button" onClick={() => setLongText(true)} className="mt-1 text-sm font-semibold">More</button>}
            </div>
          ) : g.canEdit ? (
            <button type="button" onClick={() => setDraft({ name: g.name, image: g.image ?? "", description: "" })} className={`${box} flex w-full items-center gap-2.5 p-3.5 text-left text-sm text-ink-muted hover:bg-raised`}>
              <Icon name="edit" size={16} /> Add a description
            </button>
          ) : null}
        </>
      )}

      {adding && (
        <div className={`${box} space-y-2 p-3`}>
          <p className="text-sm font-semibold">Add friends</p>
          <FriendPicker picked={picked} leaveOut={g.members.map((m) => m.user.id)} onToggle={(x) => setPicked((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]))} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!picked.length} onClick={() => void add()}>{picked.length ? `Add ${picked.length}` : "Add"}</Button>
          </div>
        </div>
      )}

      {/* the members: the first ten here, everyone behind See all */}
      <div>
        <p className="eyebrow mb-2 px-1">{g.members.length} {g.members.length === 1 ? "member" : "members"}</p>
        <div className={box}>
          <ul className="divide-y divide-line py-0.5">{g.members.slice(0, FIRST).map(memberRow)}</ul>
          {g.members.length > FIRST && (
            <button type="button" onClick={() => setAllOpen(true)} className="flex h-11 w-full items-center justify-between border-t border-line px-3.5 text-sm font-semibold hover:bg-raised">
              See all {g.members.length} <Icon name="chevron-right" size={15} className="text-ink-muted" />
            </button>
          )}
        </div>
      </div>

      {g.mine && (
        <div>
          <p className="eyebrow mb-2 px-1">Group settings</p>
          <div className={`${box} p-3.5`}>
            <Switch checked={g.membersCanEdit} onChange={(v) => void setMembersCanEdit(v)} label="Members can edit the group" hint="Change its photo, name and description, and pin messages. Off: only you." />
          </div>
        </div>
      )}

      {me && (
        <button type="button" onClick={() => setLeaving(true)} className={`${box} flex h-12 w-full items-center gap-2.5 px-3.5 text-sm font-semibold text-danger hover:bg-danger/10`}>
          <Icon name="logout" size={16} /> Leave group
        </button>
      )}

      <Modal open={allOpen} onClose={() => (setAllOpen(false), setFind(""))} title={`${g.members.length} members`} size="sm">
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Search members</span>
            <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search members" className="h-10 w-full rounded-full border border-line bg-surface pr-3 pl-10 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text focus:outline-none" />
          </label>
          <ul className="-mx-2 max-h-[60vh] divide-y divide-line overflow-y-auto">
            {matching.map(memberRow)}
            {!matching.length && <li className="py-6 text-center text-sm text-ink-muted">Nobody matches “{find.trim()}”.</li>}
          </ul>
        </div>
      </Modal>
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
