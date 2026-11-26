"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { AdminService } from "@/app/services/AdminService";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { profileHref } from "@/components/providers/ProfileCardProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { formatDateLong } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import { placeShort } from "@/lib/places";
import type { AdminUserDTO } from "@/lib/types";
import { AuditRow, Badge, ConfirmDialog } from "./AdminParts";

const EXTRAS: { kind: "kliqueStart" | "kliqueIn" | "communityCreate" | "communityJoin"; label: string; hint: string }[] = [
  { kind: "kliqueStart", label: "Kliques to start", hint: "extra this month" },
  { kind: "kliqueIn", label: "Kliques to be in", hint: "at once" },
  { kind: "communityCreate", label: "Communities to make", hint: "use within the month" },
  { kind: "communityJoin", label: "Communities to join", hint: "use within the month" },
];

/**
 * Extra on top of their plan, for a month from now: kliques to start, to be in at once, communities to make or join
 * (what they make or join with it stays). They're told, and it goes in the audit log. 0 takes it away.
 */
function ExtraLimits({ u, onChange }: { u: AdminUserDTO; onChange: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function give(kind: (typeof EXTRAS)[number]["kind"]) {
    const n = Math.max(0, Math.floor(Number(values[kind] ?? "") || 0));
    setBusy(kind);
    try {
      await AdminService.setExtra(u.id, kind, n);
      toast(n ? `Given for a month: +${n}` : "Taken away", "success");
      setValues((v) => ({ ...v, [kind]: "" }));
      onChange();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy(null);
  }
  return (
    <section>
      <h3 className="eyebrow mb-2">Extra limits</h3>
      <p className="mb-3 text-[13px] text-ink-muted">On top of their plan, for a month from now. They&apos;re told. What they make or join with it stays.</p>
      <ul className="divide-y divide-line rounded-control border border-line">
        {EXTRAS.map((x) => {
          const now = u.extras?.find((e) => e.kind === x.kind);
          return (
            <li key={x.kind} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{x.label}</p>
                <p className="text-[12px] text-ink-muted">{now ? `+${now.n} until ${formatDateLong(now.until)}` : x.hint}</p>
              </div>
              <input type="number" min={0} max={1000} inputMode="numeric" aria-label={`${x.label}: how many extra`} placeholder={now ? String(now.n) : "0"} value={values[x.kind] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [x.kind]: e.target.value }))} className="h-9 w-20 rounded-control border border-line bg-raised px-2 text-sm" />
              <Button size="sm" loading={busy === x.kind} onClick={() => void give(x.kind)}>{(values[x.kind] ?? "") === "0" ? "Take away" : "Give"}</Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function UserBadges({ u }: { u: AdminUserDTO }) {
  return (
    <>
      {u.isAdmin && <Badge tone="accent">Admin</Badge>}
      {u.suspended && <Badge tone="bad">Suspended</Badge>}
      {!u.emailVerified && <Badge>Unverified email</Badge>}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-line bg-raised/50 px-3 py-2.5">
      <p className="font-mono text-lg leading-none font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[12px] text-ink-muted">{label}</p>
    </div>
  );
}

/** Everything about one account, plus the actions an admin can take on it. */
export function PersonDrawer({ userId, onClose, onChange }: { userId: string | null; onClose: () => void; onChange: (u: AdminUserDTO) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(userId ? () => AdminService.user(userId) : null, [userId]);
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [reason, setReason] = useState("");

  async function update(patch: Parameters<typeof AdminService.updateUser>[1], ok: string) {
    if (!userId) return;
    setBusy(true);
    try {
      const { data: u } = await AdminService.updateUser(userId, patch);
      onChange(u);
      toast(ok, "success");
      setSuspending(false);
      setSigningOut(false);
      setReason("");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const d = data;
  const u = d?.user;
  return (
    <SlideOver open={!!userId} onClose={onClose} side="right" title="Account details" wide>
      {loading || (!d && !error) ? (
        <div className="space-y-4 p-6">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      ) : error || !d || !u ? (
        <div className="p-6">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="space-y-6 p-5 pt-6 sm:p-6">
          <div className="flex items-start gap-4 pr-10">
            <Avatar name={u.displayName} src={u.avatarUrl} size={56} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{u.displayName}</h2>
              <p className="truncate font-mono text-xs text-ink-muted">
                @{u.handle} · {u.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <UserBadges u={u} />
              </div>
            </div>
          </div>

          {u.suspended && (
            <div className="rounded-control border border-danger/30 bg-danger/5 p-3 text-sm">
              <p className="font-semibold text-danger">Suspended</p>
              <p className="mt-0.5 text-ink-muted">{u.suspendedReason || "No reason given."}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">Joined</dt>
            <dd>{formatDateLong(u.createdAt)}</dd>
            <dt className="text-ink-muted">Based in</dt>
            <dd>{placeShort(u)}</dd>
            <dt className="text-ink-muted">Signs in with</dt>
            <dd>{[d.hasPassword && "Password", d.googleLinked && "Google"].filter(Boolean).join(" + ") || "None"}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>{u.emailVerified ? "Verified" : "Not verified"}</dd>
          </dl>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Stat label="Owns" value={d.stats.communitiesOwned} />
            <Stat label="Member of" value={d.stats.memberships} />
            <Stat label="Hosted" value={d.stats.eventsHosted} />
            <Stat label="Reported" value={d.stats.reportsAgainst} />
            <Stat label="Reports filed" value={d.stats.reportsFiled} />
          </div>

          <section>
            <h3 className="eyebrow mb-2">Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" href={profileHref(u.handle)}>
                <Icon name="user" size={14} /> View profile
              </Button>
              <label className="inline-flex items-center gap-2 text-[13px]">
                <span className="text-ink-muted">Gender</span>
                <select
                  value={u.gender}
                  disabled={busy}
                  onChange={async (e) => {
                    const gender = e.target.value as typeof u.gender;
                    if (await confirm({ title: `Change @${u.handle}'s gender?`, body: "People can't change it themselves once it's set, and this is logged.", confirmLabel: "Change it", danger: false })) void update({ gender }, "Gender corrected");
                  }}
                  className="h-9 rounded-control border border-line bg-raised px-2"
                >
                  <option value="unspecified">Not set</option>
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                </select>
              </label>
              <Button size="sm" onClick={() => setSigningOut(true)} disabled={busy}>
                <Icon name="logout" size={14} /> Sign out everywhere
              </Button>
              {u.suspended ? (
                <Button size="sm" variant="primary" onClick={() => update({ suspended: false }, `@${u.handle} can use Klique again`)} loading={busy}>
                  <Icon name="check" size={14} /> Restore account
                </Button>
              ) : (
                !u.isAdmin && (
                  <Button size="sm" variant="danger" onClick={() => setSuspending(true)} disabled={busy}>
                    <Icon name="ban" size={14} /> Suspend
                  </Button>
                )
              )}
            </div>
          </section>

          {(d.communities.length > 0 || d.events.length > 0) && (
            <section className={`grid gap-4 ${d.communities.length && d.events.length ? "sm:grid-cols-2" : ""}`}>
              {d.communities.length > 0 && (
                <div>
                  <h3 className="eyebrow mb-2">Communities they own</h3>
                  <ul className="space-y-1 text-sm">
                    {d.communities.map((c) => (
                      <li key={c.slug} className="flex justify-between gap-2">
                        <Link href={`/communities/${c.slug}`} className="truncate hover:underline">
                          {c.name}
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-ink-muted">{c.memberCount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.events.length > 0 && (
                <div>
                  <h3 className="eyebrow mb-2">Recent events</h3>
                  <ul className="space-y-1 text-sm">
                    {d.events.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2">
                        <Link href={`/events/${e.id}`} className={`truncate hover:underline ${e.cancelled ? "text-ink-muted line-through" : ""}`}>
                          {e.title}
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-ink-muted">{new Date(e.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <ExtraLimits u={u} onChange={() => void reload()} />

          <section>
            <h3 className="eyebrow mb-2">Admin history</h3>
            {d.history.length ? (
              <ul className="divide-y divide-line rounded-control border border-line">
                {d.history.map((e) => (
                  <AuditRow key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No admin actions on this account yet.</p>
            )}
          </section>

          <Modal open={suspending} onClose={() => setSuspending(false)} title={`Suspend @${u.handle}?`} description="They're signed out everywhere and can't sign in until you restore them." size="sm">
            <div className="space-y-4">
              <TextArea label="Reason (they won't see it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSuspending(false)}>
                  Cancel
                </Button>
                <Button variant="danger" loading={busy} onClick={() => update({ suspended: true, reason: reason.trim() }, `@${u.handle} is suspended`)}>
                  Suspend
                </Button>
              </div>
            </div>
          </Modal>
          <ConfirmDialog
            open={signingOut}
            title={`Sign @${u.handle} out everywhere?`}
            description="Every phone and browser they're signed in on is signed out. They can sign straight back in, so use this for lost devices, not punishment."
            confirm="Sign out everywhere"
            withNote={false}
            onCancel={() => setSigningOut(false)}
            onConfirm={() => update({ signOut: true }, `@${u.handle} was signed out everywhere`)}
          />
        </div>
      )}
    </SlideOver>
  );
}
