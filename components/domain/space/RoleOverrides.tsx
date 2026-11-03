"use client";

import type { RoleOverrideDTO } from "@/lib/types";
import { RoleChip, useRoles } from "./RolesPanel";

type Say = "allow" | "deny" | null;

/**
 * Per-role allow / deny for seeing and posting in a channel (or every channel in a category). "As usual" follows
 * the channel's own setting. If someone has several roles, any Allow beats a Deny.
 */
export function RoleOverrides({ slug, value, onChange, category }: { slug: string; value: RoleOverrideDTO[]; onChange: (v: RoleOverrideDTO[]) => void; category?: boolean }) {
  const { data, loading } = useRoles(slug);
  const roles = (data?.items ?? []).filter((r) => r.builtin !== "admin");
  if (loading && !data) return <p className="text-sm text-ink-muted">Loading roles…</p>;
  if (!roles.length) return <p className="text-sm text-ink-muted">No roles yet. Make some in community settings → Roles, then come back to give them special access here.</p>;
  const get = (id: string) => value.find((o) => o.roleId === id) ?? { roleId: id, view: null, post: null };
  const set = (id: string, patch: Partial<RoleOverrideDTO>) => {
    const next = { ...get(id), ...patch };
    const rest = value.filter((o) => o.roleId !== id);
    onChange(next.view || next.post ? [...rest, next] : rest);
  };
  const sel = (v: Say, on: (v: Say) => void, label: string) => (
    <select value={v ?? ""} onChange={(e) => on((e.target.value || null) as Say)} aria-label={label} className="h-8 rounded-control border border-line bg-raised px-2 text-[13px] text-ink">
      <option value="">As usual</option>
      <option value="allow">Allow</option>
      <option value="deny">Deny</option>
    </select>
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">{category ? "Applies to every channel in this category, unless a channel sets its own for that role." : "Give a role access to a staff or private channel, or stop it posting here."} Owners and admins always have full access.</p>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {roles.map((r) => {
          const o = get(r.id);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <RoleChip role={r} className="mr-auto" />
              <span className="text-xs text-ink-muted">See</span>
              {sel(o.view, (v) => set(r.id, { view: v }), `${r.name}: see`)}
              <span className="text-xs text-ink-muted">Post</span>
              {sel(o.post, (v) => set(r.id, { post: v }), `${r.name}: post`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
