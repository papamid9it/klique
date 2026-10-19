"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ChannelService, type SpaceRef } from "@/app/services/ChannelService";
import { ConfirmModal } from "@/components/domain/space/parts";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { SaveBar, SettingsBlock, SettingsShell, type SettingsGroup } from "@/components/ui/SettingsShell";
import { useDebounced } from "@/lib/hooks/useApi";
import type { ChannelCategoryDTO, ChannelDTO, ChannelType, ChannelVisibility, UserBrief } from "@/lib/types";

const TYPE_CARDS: { id: ChannelType; icon: "hash" | "megaphone" | "mic"; title: string; hint: string }[] = [
  { id: "text", icon: "hash", title: "Text", hint: "Everyone who can see it can post: chat, photos, links." },
  { id: "announcement", icon: "megaphone", title: "Announcement", hint: "Everyone can read. Only owners and admins post." },
  { id: "voice", icon: "mic", title: "Voice", hint: "Talk out loud together. Members join and speak." },
];

/** Discord's "Create Channel" dialog: type cards, name, private switch. The server re-checks that you're an owner/admin. */
export function CreateChannelModal({
  space,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  space: SpaceRef;
  categories: ChannelCategoryDTO[];
  defaultCategoryId?: string | null;
  onClose: () => void;
  onSaved: (c: ChannelDTO) => void;
}) {
  const toast = useToast();
  const inGroup = !!space.sub;
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("text");
  const [priv, setPriv] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? "");
  const [guests, setGuests] = useState<UserBrief[]>([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    try {
      const res = await ChannelService.create(space, {
        name: name.trim(),
        type,
        visibility: priv ? "invite" : "all",
        categoryId: inGroup ? null : categoryId || null,
        memberIds: priv ? guests.map((g) => g.id) : undefined,
      });
      toast("Channel created", "success");
      onSaved(res.data);
    } catch (err) {
      setErrs((err as { errors?: Record<string, string> }).errors ?? {});
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create channel" description={categoryId ? `in ${categories.find((c) => c.id === categoryId)?.name ?? "category"}` : undefined}>
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="eyebrow mb-2">Channel type</legend>
          <div className="space-y-2">
            {TYPE_CARDS.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised p-3 transition has-[:checked]:border-accent-text has-[:checked]:bg-surface">
                <Icon name={t.icon} size={22} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.title}</span>
                  <span className="block text-xs text-ink-muted">{t.hint}</span>
                </span>
                <input type="radio" name="channel-type" checked={type === t.id} onChange={() => setType(t.id)} className="size-4 accent-[var(--accent-text)]" />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="new-ch-name" className="eyebrow block">
            Channel name
          </label>
          <div className="relative">
            <Icon name={type === "announcement" ? "megaphone" : type === "voice" ? "mic" : "hash"} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              id="new-ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              autoFocus
              placeholder="new-channel"
              aria-invalid={!!errs.name}
              className="h-11 w-full rounded-control border border-line bg-raised pr-3.5 pl-10 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-accent-text aria-[invalid=true]:border-danger"
            />
          </div>
          {errs.name && (
            <p role="alert" className="text-xs font-medium text-danger">
              {errs.name}
            </p>
          )}
        </div>

        {!inGroup && categories.length > 0 && (
          <SelectField label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}

        <div className="rounded-control border border-line p-3.5">
          <Switch checked={priv} onChange={setPriv} label="Private channel" hint="Only the people you pick, plus owners and admins, can see it." />
          {priv && (
            <div className="mt-3">
              <GuestPicker
                space={space}
                guests={guests}
                onAdd={(u) => setGuests((g) => (g.some((x) => x.id === u.id) ? g : [...g, u]))}
                onRemove={(u) => setGuests((g) => g.filter((x) => x.id !== u.id))}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>
            Create channel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Discord-style full-screen channel settings: Overview, Permissions, Delete. Saves from the "unsaved changes" bar. */
export function ChannelSettings({
  space,
  channel,
  categories,
  initialTab = "overview",
  onClose,
  onSaved,
  onDeleted,
}: {
  space: SpaceRef;
  channel: ChannelDTO;
  categories: ChannelCategoryDTO[];
  initialTab?: "overview" | "permissions";
  onClose: () => void;
  onSaved: (c: ChannelDTO) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const inGroup = !!space.sub;
  const [tab, setTab] = useState<string>(initialTab);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [type, setType] = useState<ChannelType>(channel.type);
  const [visibility, setVisibility] = useState<ChannelVisibility>(channel.visibility);
  const [categoryId, setCategoryId] = useState<string>(channel.categoryId ?? "");
  const [guests, setGuests] = useState<UserBrief[]>([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  const dirty = name !== channel.name || topic !== (channel.topic ?? "") || type !== channel.type || visibility !== channel.visibility || categoryId !== (channel.categoryId ?? "");

  useEffect(() => {
    if (channel.visibility !== "invite") return;
    let alive = true;
    ChannelService.guests(space, channel.slug).then(
      (r) => alive && setGuests(r.data),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [channel, space]);

  async function addGuest(u: UserBrief) {
    if (guests.some((g) => g.id === u.id)) return;
    if (channel.visibility === "invite") {
      try {
        await ChannelService.addGuest(space, channel.slug, u.id);
      } catch (e) {
        toast(errorMessage(e), "error");
        return;
      }
    }
    setGuests((g) => [...g, u]);
  }
  async function removeGuest(u: UserBrief) {
    if (channel.visibility === "invite") {
      try {
        await ChannelService.removeGuest(space, channel.slug, u.id);
      } catch (e) {
        toast(errorMessage(e), "error");
        return;
      }
    }
    setGuests((g) => g.filter((x) => x.id !== u.id));
  }

  function reset() {
    setName(channel.name);
    setTopic(channel.topic ?? "");
    setType(channel.type);
    setVisibility(channel.visibility);
    setCategoryId(channel.categoryId ?? "");
    setErrs({});
  }

  async function save() {
    setBusy(true);
    setErrs({});
    try {
      const res = await ChannelService.update(space, channel.slug, { name: name.trim(), topic: topic.trim(), type, visibility, categoryId: inGroup ? null : categoryId || null });
      // Switching a channel to private: add whoever was picked.
      if (visibility === "invite" && channel.visibility !== "invite") {
        for (const g of guests) await ChannelService.addGuest(space, res.data.slug, g.id);
      }
      toast("Channel updated", "success");
      onSaved(res.data);
    } catch (err) {
      setErrs((err as { errors?: Record<string, string> }).errors ?? {});
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const groups: SettingsGroup[] = [
    {
      title: `#${channel.name}`,
      items: [
        { id: "overview", label: "Overview", icon: "sliders" },
        { id: "permissions", label: "Permissions", icon: "lock" },
      ],
    },
    { items: [{ id: "delete", label: "Delete channel", icon: "trash", danger: true }] },
  ];

  return (
    <SettingsShell
      heading={`${inGroup ? "Group channel" : "Channel"} settings`}
      groups={groups}
      active={tab}
      onSelect={setTab}
      onClose={onClose}
      title={tab === "overview" ? "Overview" : tab === "permissions" ? "Permissions" : "Delete channel"}
    >
      {tab === "overview" && (
        <div className="space-y-5">
          <TextField label="Channel name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} error={errs.name} />
          <TextArea label="Channel topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} counter={200} placeholder="Let everyone know how to use this channel." error={errs.topic} />
          {!inGroup && (
            <SelectField label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
      )}

      {tab === "permissions" && (
        <div className="space-y-6">
          <SettingsBlock title="Who can post" intro="Everyone who can see the channel can read it.">
            <div className="space-y-2">
              {TYPE_CARDS.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised p-3 transition has-[:checked]:border-accent-text has-[:checked]:bg-surface">
                  <Icon name={t.icon} size={20} className="shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t.title}</span>
                    <span className="block text-xs text-ink-muted">{t.hint}</span>
                  </span>
                  <input type="radio" name="post-type" checked={type === t.id} onChange={() => setType(t.id)} className="size-4 accent-[var(--accent-text)]" />
                </label>
              ))}
            </div>
          </SettingsBlock>
          <SettingsBlock title="Who can see it">
            <div className="space-y-2">
              {(
                [
                  ["all", "globe", inGroup ? "Everyone in the group" : "Everyone in the community", "The default: anyone who can see the space can see this channel."],
                  ["managers", "shield", "Owners and admins only", "Hidden from regular members completely: a staff room."],
                  ["invite", "lock", "Private: only people you pick", "A private room. Only the people you pick, plus owners and admins, can see it."],
                ] as const
              ).map(([id, icon, title, hint]) => (
                <label key={id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-raised p-3 transition has-[:checked]:border-accent-text has-[:checked]:bg-surface">
                  <Icon name={icon} size={20} className="shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-ink-muted">{hint}</span>
                  </span>
                  <input type="radio" name="see" checked={visibility === id} onChange={() => setVisibility(id)} className="size-4 accent-[var(--accent-text)]" />
                </label>
              ))}
            </div>
          </SettingsBlock>
          {visibility === "invite" && (
            <SettingsBlock title="Members of this channel">
              <GuestPicker space={space} guests={guests} onAdd={addGuest} onRemove={removeGuest} />
            </SettingsBlock>
          )}
        </div>
      )}

      {tab === "delete" && (
        <SettingsBlock danger>
          <p className="text-sm font-medium">Delete #{channel.name}</p>
          <p className="mt-1 mb-4 text-sm text-ink-muted">Every message in it is removed for everyone. This can&apos;t be undone.</p>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={15} /> Delete channel
          </Button>
        </SettingsBlock>
      )}

      {tab !== "delete" && <SaveBar dirty={dirty} busy={busy} onReset={reset} onSave={() => void save()} disabled={name.trim().length < 2} />}

      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete #${channel.name}?`}
        description="All messages in it are removed for everyone. This can't be undone."
        confirmLabel="Delete channel"
        onConfirm={async () => {
          await ChannelService.remove(space, channel.slug);
          toast("Channel deleted", "success");
          onDeleted();
        }}
      />
    </SettingsShell>
  );
}

/** Pick people (already members of this community/group) for a private channel. */
function GuestPicker({ space, guests, onAdd, onRemove }: { space: SpaceRef; guests: UserBrief[]; onAdd: (u: UserBrief) => void; onRemove: (u: UserBrief) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [results, setResults] = useState<UserBrief[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused && !dq) return;
    let alive = true;
    ChannelService.searchMembers(space, dq).then(
      (r) => alive && setResults(r.data),
      () => alive && setResults([]),
    );
    return () => {
      alive = false;
    };
  }, [dq, focused, space]);

  const shown = results.filter((r) => !guests.some((g) => g.id === r.id));
  return (
    <div className="space-y-2.5 rounded-card border border-line bg-raised/50 p-3">
      <p className="text-[13px] font-medium">Who&apos;s in ({guests.length})</p>
      {guests.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {guests.map((g) => (
            <li key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-1.5 pl-1 text-[13px]">
              <Avatar name={g.displayName} src={g.avatarUrl} frame={g.avatarFrame} size={20} />
              {g.displayName}
              <button type="button" onClick={() => onRemove(g)} aria-label={`Remove ${g.displayName}`} className="inline-flex size-5 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-ink">
                <Icon name="x" size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <label htmlFor="guest-search" className="sr-only">
          Search members to add
        </label>
        <input
          id="guest-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search members to add…"
          autoComplete="off"
          className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-accent-text"
        />
        {focused && shown.length > 0 && (
          <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-control border border-line bg-surface p-1">
            {shown.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onAdd(u)} className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left hover:bg-raised">
                  <Avatar name={u.displayName} src={u.avatarUrl} frame={u.avatarFrame} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.displayName}</span>
                  <span className="font-mono text-[11px] text-ink-muted">@{u.handle}</span>
                  <Icon name="plus" size={14} className="text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-ink-muted">Only existing members can be added. Owners and admins can always see private channels.</p>
    </div>
  );
}

/** Name-only modal for creating / renaming a category. */
export function CategoryModal({ slug, category, onClose, onSaved }: { slug: string; category?: ChannelCategoryDTO; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(undefined);
    try {
      if (category) await ChannelService.renameCategory(slug, category.id, name.trim());
      else await ChannelService.createCategory(slug, name.trim());
      onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={category ? "Rename category" : "New category"} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus error={err} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>
            {category ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
