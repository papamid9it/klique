"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { ChannelService } from "@/app/services/ChannelService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { SaveBar, SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { cx } from "@/components/ui/cx";
import { useApi } from "@/lib/hooks/useApi";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();

interface Welcome {
  enabled: boolean;
  message: string;
  rules: string[];
  requireAccept: boolean;
  channels: { id: string; name: string; slug: string; note: string }[];
  greetChannelId: string | null;
  greetText: string;
  roles: { id: string; name: string; color: string | null; icon: string | null }[];
  me: { roleIds: string[]; needsRules: boolean; pending: boolean };
}

/**
 * What a new member sees once: the owner's message, the rules (tick to accept, when required before posting), roles
 * to give yourself, and channels to start in. Closing it without accepting is fine; posting just waits.
 */
export function WelcomeModal({ slug, name, onClose, onDone }: { slug: string; name: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data, loading, error } = useApi(() => api.get<Envelope<Welcome>>(`/api/communities/${slug}/welcome`), [slug], { key: `welcome:${slug}` });
  const [agree, setAgree] = useState(false);
  const [roles, setRoles] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = roles ?? new Set(data?.me.roleIds ?? []);
  const mustAccept = !!data && data.requireAccept && data.rules.length > 0 && data.me.needsRules;
  async function finish() {
    setBusy(true);
    try {
      await api.post(`/api/communities/${slug}/welcome/accept`, { acceptRules: agree || !mustAccept, roleIds: [...picked].filter((id) => data?.roles.some((r) => r.id === id)) });
      onDone();
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Welcome to ${name}`} size="lg">
      {loading && !data ? (
        <Skeleton className="h-60 w-full" />
      ) : error || !data ? (
        <ErrorState message={error} />
      ) : (
        <div className="space-y-6">
          {data.message && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{data.message}</p>}
          {data.rules.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">The rules</h3>
              <ol className="space-y-2">
                {data.rules.map((r, i) => (
                  <li key={i} className="flex gap-3 rounded-control bg-raised p-3 text-sm">
                    <span className="font-mono text-xs text-ink-muted">{i + 1}</span>
                    <span className="whitespace-pre-wrap">{r}</span>
                  </li>
                ))}
              </ol>
              {mustAccept && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="size-4 accent-[var(--accent-text)]" /> I&apos;ve read the rules and I&apos;ll follow them
                </label>
              )}
            </section>
          )}
          {data.roles.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Pick your roles</h3>
              <div className="flex flex-wrap gap-2">
                {data.roles.map((r) => {
                  const on = picked.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRoles(() => { const n = new Set(picked); if (on) n.delete(r.id); else n.add(r.id); return n; })}
                      className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition", on ? "border-accent-text bg-accent/15" : "border-line text-ink-muted hover:text-ink")}
                    >
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: r.color ?? "var(--ink-muted)" }} />
                      {r.icon && <span aria-hidden="true">{r.icon}</span>}
                      {r.name}
                      {on && <Icon name="check" size={13} />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {data.channels.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Start here</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.channels.map((c) => (
                  <li key={c.id}>
                    <Link href={`/communities/${slug}?c=${c.slug}`} onClick={() => !mustAccept && void finish()} className="block rounded-control border border-line p-3 transition hover:border-ink-muted/60">
                      <span className="block text-sm font-semibold"># {c.name}</span>
                      {c.note && <span className="block text-xs text-ink-muted">{c.note}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex justify-end gap-2">
            {!mustAccept && <Button onClick={onClose}>Later</Button>}
            <Button variant="primary" loading={busy} disabled={mustAccept && !agree} onClick={() => void finish()}>
              {mustAccept ? "Accept and join in" : "Let's go"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Community settings → Welcome (owners and admins). */
export function WelcomePanel({ slug, name }: { slug: string; name: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<Welcome>>(`/api/communities/${slug}/welcome`), [slug], { key: `welcome-edit:${slug}` });
  const channels = useApi(() => ChannelService.list({ slug }), [slug], { key: `welcome-ch:${slug}` });
  const [w, setW] = useState<Omit<Welcome, "roles" | "me"> | null>(null);
  const [rulesText, setRulesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (!data) return;
    setW({ enabled: data.enabled, message: data.message, rules: data.rules, requireAccept: data.requireAccept, channels: data.channels, greetChannelId: data.greetChannelId, greetText: data.greetText });
    setRulesText(data.rules.join("\n"));
  }, [data]);
  if ((loading && !data) || (data && !w)) return <Skeleton className="h-80 w-full rounded-card" />;
  if (error || !data || !w) return <ErrorState message={error} onRetry={reload} />;
  const list = (channels.data?.channels ?? []).filter((c) => c.type !== "voice");
  const body = { ...w, rules: lines(rulesText).slice(0, 20), channels: w.channels.map((c) => ({ channelId: c.id, note: c.note })) };
  const dirty = JSON.stringify(body) !== JSON.stringify({ enabled: data.enabled, message: data.message, rules: data.rules, requireAccept: data.requireAccept, channels: data.channels.map((c) => ({ channelId: c.id, note: c.note })), greetChannelId: data.greetChannelId, greetText: data.greetText });
  const set = (patch: Partial<typeof w>) => setW({ ...w, ...patch });

  async function save() {
    setBusy(true);
    try {
      await api.put(`/api/communities/${slug}/welcome`, body);
      toast("Welcome screen saved", "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsBlock title="Welcome screen" intro="Shown once to each new member: your message, the rules, roles they can pick, and channels to start in.">
        <Switch checked={w.enabled} onChange={(v) => set({ enabled: v })} label="Show a welcome screen" />
        {w.enabled && (
          <Button size="sm" className="mt-3" onClick={() => setPreview(true)} disabled={dirty} title={dirty ? "Save first" : undefined}>
            <Icon name="eye" size={14} /> Preview
          </Button>
        )}
      </SettingsBlock>
      <fieldset disabled={!w.enabled} className="disabled:opacity-60">
        <SettingsBlock title="Message">
          <TextArea label="Welcome message" value={w.message} onChange={(e) => set({ message: e.target.value })} rows={4} maxLength={1000} counter={1000} placeholder={`Welcome to ${name}! We skate Freedom Park every Sunday…`} />
        </SettingsBlock>
        <SettingsBlock title="Rules">
          <TextArea label="One rule per line" value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={5} placeholder={"Be kind.\nNo selling without asking an admin.\nNo spam."} hint="Up to 20." />
          <div className="mt-3">
            <Switch checked={w.requireAccept} onChange={(v) => set({ requireAccept: v })} label="New members must accept the rules before posting" hint="Until they do, they can read but not post or react. Owners and admins don't need to." />
          </div>
        </SettingsBlock>
        <SettingsBlock title="Roles to pick" intro="Roles marked “Members can give it to themselves” (in Roles) are offered here.">
          {data.roles.length ? <p className="text-sm">{data.roles.map((r) => r.name).join(", ")}</p> : <p className="text-sm text-ink-muted">None yet. Open Roles, edit a role and switch on “Members can give it to themselves”.</p>}
        </SettingsBlock>
        <SettingsBlock title="Start here" intro="Up to 5 channels to point new members to, with a line about each.">
          <div className="space-y-2">
            {w.channels.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-sm font-medium">#{c.name}</span>
                <input value={c.note} maxLength={120} onChange={(e) => set({ channels: w.channels.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} placeholder="What it's for" aria-label={`Note for #${c.name}`} className="h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-3 text-sm" />
                <Button size="sm" variant="ghost" onClick={() => set({ channels: w.channels.filter((_, j) => j !== i) })} aria-label={`Remove #${c.name}`}>
                  <Icon name="x" size={14} />
                </Button>
              </div>
            ))}
            {w.channels.length < 5 && (
              <select
                value=""
                onChange={(e) => {
                  const ch = list.find((x) => x.id === e.target.value);
                  if (ch) set({ channels: [...w.channels, { id: ch.id, name: ch.name, slug: ch.slug, note: "" }] });
                }}
                aria-label="Add a channel"
                className="h-9 rounded-control border border-line bg-raised px-2 text-sm"
              >
                <option value="">+ Add a channel</option>
                {list.filter((x) => !w.channels.some((c) => c.id === x.id)).map((x) => (
                  <option key={x.id} value={x.id}>
                    #{x.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </SettingsBlock>
        <SettingsBlock title="Greeting" intro="Post a hello in a channel when someone joins.">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Channel" value={w.greetChannelId ?? ""} onChange={(e) => set({ greetChannelId: e.target.value || null })}>
              <option value="">Don&apos;t post a greeting</option>
              {list.map((x) => (
                <option key={x.id} value={x.id}>
                  #{x.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Message" value={w.greetText} onChange={(e) => set({ greetText: e.target.value })} maxLength={300} placeholder="Welcome {user}! 👋" hint="{user} mentions them, {name} is their name." />
          </div>
        </SettingsBlock>
      </fieldset>
      <SaveBar dirty={dirty} busy={busy} onReset={() => data && (setW({ enabled: data.enabled, message: data.message, rules: data.rules, requireAccept: data.requireAccept, channels: data.channels, greetChannelId: data.greetChannelId, greetText: data.greetText }), setRulesText(data.rules.join("\n")))} onSave={() => void save()} />
      {preview && <WelcomeModal slug={slug} name={name} onClose={() => setPreview(false)} onDone={() => setPreview(false)} />}
    </>
  );
}
