"use client";

import { useState } from "react";
import ApiClient, { errorMessage, isApiError } from "@/app/ApiCore";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Switch, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import { PERMISSIONS, ROLE_COLORS, type Permission } from "@/lib/roles";
import type { Envelope, RoleDTO } from "@/lib/types";
import { ConfirmModal } from "./parts";

const api = new ApiClient();
/** The powers, in three plain groups (as in the app) */
const POWER_GROUPS: { title: string; items: { id: Permission; label: string; hint: string }[] }[] = [
  { title: "In chat", items: [
    { id: "deleteMessages", label: "Remove messages", hint: "Delete other people's messages, posts and comments" },
    { id: "mentionEveryone", label: "Ping everyone", hint: "Use @everyone and @here, even when members can't" },
  ] },
  { title: "With people", items: [
    { id: "timeout", label: "Mute people", hint: "Stop someone writing for a while" },
    { id: "kick", label: "Remove people", hint: "They can join again" },
    { id: "ban", label: "Ban people", hint: "Removed for good" },
    { id: "manageRoles", label: "Give roles", hint: "Only roles below this one" },
  ] },
  { title: "Running the community", items: [
    { id: "manageChannels", label: "Chat rooms", hint: "Add, edit and order rooms and sections" },
    { id: "manageEvents", label: "Events", hint: "Approve, edit and cancel members' events" },
    { id: "manageEmoji", label: "Custom emoji", hint: "Add and delete the community's emoji" },
    { id: "manageWebhooks", label: "Bots and connections", hint: "Normally the owner only" },
    { id: "viewModLog", label: "Removed content log", hint: "See what was removed, and by whom" },
  ] },
];
const SHORT: Partial<Record<Permission, string>> = { deleteMessages: "removes messages", mentionEveryone: "pings everyone", timeout: "mutes", kick: "removes people", ban: "bans", manageRoles: "gives roles", manageChannels: "edits rooms", manageEvents: "handles events", manageEmoji: "adds emoji", manageWebhooks: "runs bots", viewModLog: "sees the log" };
/** "Removes messages, mutes and removes people": what a role does, in a line */
function powersLine(perms: Permission[]): string {
  const words = perms.map((x) => SHORT[x]).filter((x): x is string => !!x);
  if (!words.length) return "A name, colour and emoji, no extra powers";
  const shown = words.slice(0, 3);
  const more = words.length - shown.length;
  const line = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return `${line[0].toUpperCase()}${line.slice(1)}${more ? ` (+${more} more)` : ""}`;
}
/** One click makes these (renamed or changed after, like any role) */
const READY: { name: string; color: string; permissions: Permission[]; line: string; icon: "shield" | "calendar" }[] = [
  { name: "Moderator", color: ROLE_COLORS[2], permissions: ["deleteMessages", "timeout", "kick", "viewModLog"], line: "Removes messages, mutes and removes people", icon: "shield" },
  { name: "Event helper", color: ROLE_COLORS[4], permissions: ["manageEvents"], line: "Approves and edits members' events", icon: "calendar" },
];

type Roles = { items: RoleDTO[]; myRank: number; canManage: boolean; cap: number; owner: { icon: string | null; canEdit: boolean } };

/** The community's roles, for pickers elsewhere (members, channel permissions). */
export function useRoles(slug: string) {
  return useApi(() => api.get<Envelope<Roles>>(`/api/communities/${slug}/roles`), [slug], { key: `roles:${slug}` });
}

/** A role's name in its colour (with its emoji), as a small chip. */
export function RoleChip({ role, className }: { role: Pick<RoleDTO, "name" | "color" | "icon">; className?: string }) {
  return (
    <span className={cx("inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] font-semibold", className)}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: role.color ?? "var(--ink-muted)" }} />
      {role.icon && <span aria-hidden="true">{role.icon}</span>}
      <span className="truncate">{role.name}</span>
    </span>
  );
}

/**
 * Community settings → Roles: custom roles, top first. Make one (it goes under your own), edit its name, colour,
 * emoji and permissions, move it up or down among the roles below yours, or delete it. The Admin role stands for
 * "admin"; its permissions are fixed. You can't touch roles at or above your own.
 */
export function RolesPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useRoles(slug);
  const [editing, setEditing] = useState<RoleDTO | "new" | null>(null);
  const [removing, setRemoving] = useState<RoleDTO | null>(null);
  const [editingOwner, setEditingOwner] = useState(false);
  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  const roles = data.items;
  const mine = (r: RoleDTO) => r.position < data.myRank;
  const ready = data.canManage && roles.length < data.cap ? READY.filter((x) => !roles.some((r) => r.name.toLowerCase() === x.name.toLowerCase())) : [];
  async function addReady(x: (typeof READY)[number]) {
    try {
      await api.post(`/api/communities/${slug}/roles`, { name: x.name, color: x.color, icon: null, permissions: x.permissions, selfAssignable: false });
      toast(`${x.name} role added`, "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function move(r: RoleDTO, dir: -1 | 1) {
    const movable = roles.filter(mine);
    const i = movable.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= movable.length) return;
    const order = [...movable];
    [order[i], order[j]] = [order[j], order[i]];
    try {
      const res = await api.put<Envelope<RoleDTO[]>>(`/api/communities/${slug}/roles/order`, { ids: order.map((x) => x.id) });
      setData((d) => (d ? { ...d, items: res.data.map((x) => ({ ...x, memberCount: roles.find((y) => y.id === x.id)?.memberCount })) } : d));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <SettingsBlock title="Roles" intro="Give trusted members a role so they can help run the community. Higher roles can manage the ones below them.">
        {ready.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">Ready-made roles</p>
            <p className="mb-2 text-sm text-ink-muted">Add one in a click. You can rename or change it after.</p>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {ready.map((x) => (
                <li key={x.name}>
                  <button type="button" onClick={() => void addReady(x)} aria-label={`Add a ${x.name} role. ${x.line}`} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised">
                    <Icon name={x.icon} size={19} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{x.name}</span>
                      <span className="block text-[13px] text-ink-muted">{x.line}</span>
                    </span>
                    <Icon name="plus" size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setEditing("new")} disabled={roles.length >= data.cap}>
            <Icon name="plus" size={14} /> New custom role
          </Button>
          <span className="text-xs text-ink-muted">
            {roles.length} of {data.cap}
          </span>
        </div>
      </SettingsBlock>
      <SettingsBlock>
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          <li className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: "var(--ink-muted)" }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {data.owner.icon && <span className="mr-1">{data.owner.icon}</span>}
                Owner
                <span className="ml-2 text-[12px] font-normal text-ink-muted">built in</span>
              </p>
              <p className="truncate text-xs text-ink-muted">1 person · every permission</p>
            </div>
            {data.owner.canEdit ? (
              <Button size="sm" variant="ghost" onClick={() => setEditingOwner(true)}>
                Edit
              </Button>
            ) : (
              <span className="text-[12px] text-ink-muted" title="Only the owner can change this">
                <Icon name="lock" size={13} />
              </span>
            )}
          </li>
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: r.color ?? "var(--ink-muted)" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={r.color ? { color: r.color } : undefined}>
                  {r.icon && <span className="mr-1">{r.icon}</span>}
                  {r.name}
                  {r.builtin && <span className="ml-2 text-[12px] font-normal text-ink-muted">built in</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {r.memberCount ?? 0} {(r.memberCount ?? 0) === 1 ? "person" : "people"} · {r.builtin === "admin" ? "Can do everything" : powersLine(r.permissions)}
                  {r.selfAssignable ? " · members can pick it" : ""}
                </p>
              </div>
              {mine(r) ? (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void move(r, -1)} aria-label={`Move ${r.name} up`} className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-raised hover:text-ink">
                    <Icon name="chevron-up" size={16} />
                  </button>
                  <button type="button" onClick={() => void move(r, 1)} aria-label={`Move ${r.name} down`} className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-raised hover:text-ink">
                    <Icon name="chevron-down" size={16} />
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  {!r.builtin && (
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(r)} aria-label={`Delete ${r.name}`}>
                      <Icon name="trash" size={14} />
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-[12px] text-ink-muted" title="It's at or above your own highest role">
                  <Icon name="lock" size={13} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </SettingsBlock>
      {editing && (
        <RoleModal
          slug={slug}
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {editingOwner && (
        <OwnerEmojiModal
          slug={slug}
          icon={data.owner.icon}
          onClose={() => setEditingOwner(false)}
          onSaved={(icon) => {
            setEditingOwner(false);
            setData((d) => (d ? { ...d, owner: { ...d.owner, icon } } : d));
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.name ?? "this role"}?`}
        description="Everyone loses it, and channels stop treating it specially. This can't be undone."
        confirmLabel="Delete role"
        onConfirm={async () => {
          await api.delete(`/api/communities/${slug}/roles/${removing!.id}`);
          setRemoving(null);
          toast("Role deleted", "success");
          await reload();
        }}
      />
    </>
  );
}

/** The owner's emoji: on their picture inside this community, like a role's. */
function OwnerEmojiModal({ slug, icon, onClose, onSaved }: { slug: string; icon: string | null; onClose: () => void; onSaved: (icon: string | null) => void }) {
  const toast = useToast();
  const [value, setValue] = useState(icon ?? "");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.put<Envelope<{ icon: string | null }>>(`/api/communities/${slug}/roles/owner`, { icon: value.trim() || null });
      toast("Owner emoji saved", "success");
      onSaved(res.data.icon);
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Owner emoji" description="It shows on your picture inside this community. Leave it empty for none." size="sm">
      <form onSubmit={save} className="space-y-5" noValidate>
        <TextField label="Emoji (optional)" value={value} onChange={(e) => setValue(e.target.value)} maxLength={4} placeholder="👑" />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RoleModal({ slug, role, onClose, onSaved }: { slug: string; role: RoleDTO | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState<string | null>(role?.color ?? ROLE_COLORS[5]);
  const [icon, setIcon] = useState(role?.icon ?? "");
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [self, setSelf] = useState(!!role?.selfAssignable);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fixed = role?.builtin === "admin";
  const toggle = (p: Permission, on: boolean) => setPerms((s) => (on ? new Set(s).add(p) : new Set([...s].filter((x) => x !== p))));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = { name: name.trim(), color, icon: icon.trim() || null, ...(fixed ? {} : { permissions: [...perms], selfAssignable: self }) };
    try {
      if (role) await api.patch(`/api/communities/${slug}/roles/${role.id}`, body);
      else await api.post(`/api/communities/${slug}/roles`, body);
      toast(role ? "Role saved" : "Role made", "success");
      onSaved();
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={role ? `Edit ${role.name}` : "New role"} description={role ? undefined : "It goes just under your own highest role. You can move it after."}>
      <form onSubmit={save} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Moderator" error={errors.name} />
          <TextField label="Emoji (optional)" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="🛡️" />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setColor(null)} aria-pressed={color === null} className={cx("h-8 rounded-full border px-3 text-xs", color === null ? "border-accent-text" : "border-line text-ink-muted")}>
              None
            </button>
            {ROLE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={cx("size-8 rounded-full border-2 transition", color === c ? "border-ink" : "border-transparent")} style={{ background: c }} />
            ))}
            <input type="color" value={color ?? "#95a5a6"} onChange={(e) => setColor(e.target.value)} aria-label="Pick any colour" className="size-8 cursor-pointer rounded-full border border-line bg-transparent" />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium">What they can do</legend>
          {fixed ? (
            <p className="text-sm text-ink-muted">The Admin role can do everything except manage webhooks, which stays the owner&apos;s. Its permissions can&apos;t be changed.</p>
          ) : (
            <div className="space-y-4">
              {POWER_GROUPS.map((g) => (
                <div key={g.title} className="space-y-2">
                  <p className="text-[13px] font-semibold text-ink-muted">{g.title}</p>
                  {g.items.filter((p) => PERMISSIONS.some((x) => x.id === p.id)).map((p) => (
                    <Switch key={p.id} checked={perms.has(p.id)} onChange={(v) => toggle(p.id, v)} label={p.label} hint={p.hint} />
                  ))}
                </div>
              ))}
              <p className="text-xs text-ink-muted">You can only give powers you have yourself. Whatever the permission, people only ever act on members below them in the role list.</p>
            </div>
          )}
        </fieldset>
        {!fixed && <Switch checked={self} onChange={setSelf} label="Members can give it to themselves" hint="It's offered on the welcome screen when they join (for fun roles like interests, not powers)." />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            {role ? "Save" : "Make role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Pick which roles someone holds (only roles below yours can be changed). */
export function MemberRolesModal({ slug, user, current, onClose, onSaved }: { slug: string; user: { id: string; displayName: string }; current: string[]; onClose: () => void; onSaved: (roles: RoleDTO[]) => void }) {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, loading } = useRoles(slug);
  const [picked, setPicked] = useState<Set<string>>(new Set(current));
  const [busy, setBusy] = useState(false);
  const roles = data?.items ?? [];
  const [asking, setAsking] = useState(false);
  // your own roles at or above your rank that you've unticked: once saved, you can't give them back to yourself
  const stepsDown = user.id === me?.id ? roles.filter((r) => current.includes(r.id) && !picked.has(r.id) && r.position >= (data?.myRank ?? 0)) : [];
  async function save() {
    const res = await api.put<Envelope<{ roleIds: string[] }>>(`/api/communities/${slug}/members/${user.id}/roles`, { roleIds: [...picked] });
    toast("Roles saved", "success");
    onSaved(roles.filter((r) => res.data.roleIds.includes(r.id)));
  }
  if (asking) {
    const names = stepsDown.map((r) => r.name).join(", ");
    return (
      <ConfirmModal open onClose={() => setAsking(false)} title={`Step down from ${names}?`} description={`You'll lose what ${stepsDown.length > 1 ? "these roles let" : "this role lets"} you do here. Only the owner or someone above you can give ${stepsDown.length > 1 ? "them" : "it"} back.`} confirmLabel="Step down" onConfirm={save} />
    );
  }
  return (
    <Modal open onClose={onClose} title={`${user.displayName}'s roles`} description="Tick the roles they should have." size="sm">
      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {roles.map((r) => {
              // a role you hold yourself can be unticked (stepping down), and ticked again before saving
              const stepDown = user.id === me?.id && current.includes(r.id);
              const locked = r.position >= (data?.myRank ?? 0) && !stepDown;
              return (
                <li key={r.id}>
                  <label className={cx("flex items-center gap-3 rounded-control px-2 py-2", locked ? "opacity-50" : "cursor-pointer hover:bg-raised")}>
                    <input type="checkbox" disabled={locked} checked={picked.has(r.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="size-4 accent-[var(--accent-text)]" />
                    <RoleChip role={r} />
                    {r.builtin === "admin" && <span className="text-[12px] text-ink-muted">makes them an admin</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                // stepping down from a role of your own: asked first, as only someone higher can give it back
                if (stepsDown.length) return setAsking(true);
                setBusy(true);
                try {
                  await save();
                } catch (e) {
                  toast(errorMessage(e), "error");
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
