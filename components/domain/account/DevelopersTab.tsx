"use client";

import Link from "next/link";
import { useState } from "react";
import ApiClient, { errorMessage, isApiError } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { useApi } from "@/lib/hooks/useApi";
import { BOT_PERMISSIONS } from "@/lib/roles";
import type { Envelope, UserBrief } from "@/lib/types";
import { useConfirm } from "@/components/providers/ConfirmProvider";

const api = new ApiClient();

interface Bot {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  endpoint: string | null;
  permissions: string[];
  commands: { name: string; description: string }[];
  user: UserBrief | null;
  signingSecret?: string;
  inviteUrl: string;
  communities: number;
  failures: number;
  disabled: boolean;
}

const copy = async (text: string, toast: ReturnType<typeof useToast>, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, "success");
  } catch {
    toast("Couldn't copy. Select it and copy it.", "error");
  }
};

/**
 * Settings → Developers: make bots (Pro), get their token (shown once) and signing secret, set where events go,
 * pick the permissions they ask for, and share the invite link community owners use to add them.
 */
export function DevelopersTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<{ items: Bot[]; canCreate: boolean; reason: string | null }>>("/api/me/bots"), [], { key: "my-bots" });
  const [editing, setEditing] = useState<Bot | "new" | null>(null);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  const [removing, setRemoving] = useState<Bot | null>(null);
  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5">
        <p className="eyebrow">Bots</p>
        <h2 className="mt-1 text-lg font-semibold">Build bots for communities</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Bots can welcome people, moderate, run polls and games, post alerts and answer slash commands. Read the{" "}
          <Link href="/developers" className="font-medium text-accent-text underline">
            developer guide
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setEditing("new")} disabled={!data.canCreate}>
            <Icon name="plus" size={14} /> New bot
          </Button>
          {data.reason && (
            <span className="text-sm text-ink-muted">
              {data.reason}{" "}
              {/Pro/.test(data.reason) && (
                <Link href="/pricing" className="font-medium text-accent-text underline">
                  See Pro
                </Link>
              )}
            </span>
          )}
        </div>
      </section>

      {data.items.map((b) => (
        <section key={b.id} className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-start gap-3">
            <Avatar name={b.name} src={b.avatarUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {b.name} <span className="ml-1 font-mono text-xs text-ink-muted">@{b.user?.handle}</span>
              </p>
              <p className="text-sm text-ink-muted">{b.description || "No description yet."}</p>
              <p className="mt-1 text-xs text-ink-muted">
                In {b.communities} {b.communities === 1 ? "community" : "communities"} · {b.commands.length} slash {b.commands.length === 1 ? "command" : "commands"}
                {b.disabled ? " · events switched off after too many failures (save the endpoint again to switch them back on)" : b.failures ? ` · ${b.failures} failed deliveries in a row` : ""}
              </p>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Invite link (give it to community owners)</dt>
              <dd className="mt-1 flex gap-2">
                <input readOnly value={b.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-2 font-mono text-[12px]" aria-label="Invite link" />
                <Button size="sm" onClick={() => void copy(b.inviteUrl, toast, "Link")}>
                  Copy
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Events go to</dt>
              <dd className="mt-1 truncate font-mono text-[12px]">{b.endpoint ?? "Nowhere yet (set an endpoint to get events)"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Signing secret (check events are from Klique)</dt>
              <dd className="mt-1 flex gap-2">
                <input readOnly type="password" value={b.signingSecret ?? ""} className="h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-2 font-mono text-[12px]" aria-label="Signing secret" />
                <Button size="sm" onClick={() => void copy(b.signingSecret ?? "", toast, "Secret")}>
                  Copy
                </Button>
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditing(b)}>
              Edit
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!(await confirm({ title: "Make a new token?", body: "The old token stops working straight away; update your bot with the new one.", confirmLabel: "New token" }))) return;
                try {
                  const res = await api.post<Envelope<{ token: string }>>(`/api/me/bots/${b.id}/token`, {});
                  setToken({ name: b.name, token: res.data.token });
                } catch (e) {
                  toast(errorMessage(e), "error");
                }
              }}
            >
              New token
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(b)}>
              Delete
            </Button>
          </div>
        </section>
      ))}

      {editing && (
        <BotModal
          bot={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (made) => {
            setEditing(null);
            if (made) setToken(made);
            await reload();
          }}
        />
      )}
      <Modal open={!!token} onClose={() => setToken(null)} title={`${token?.name ?? "Bot"}'s token`} description="Copy it now and keep it secret: it's shown only this once. Anyone with it can act as your bot." size="sm">
        <div className="space-y-3">
          <input readOnly value={token?.token ?? ""} onFocus={(e) => e.currentTarget.select()} className="h-10 w-full rounded-control border border-line bg-raised px-3 font-mono text-[12px]" aria-label="Bot token" />
          <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={() => token && void copy(token.token, toast, "Token")}>
              <Icon name="copy" size={14} /> Copy token
            </Button>
            <Button onClick={() => setToken(null)}>Done</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? "this bot"}?`} description="It leaves every community it's in. Its old messages stay." size="sm">
        <div className="flex justify-end gap-2">
          <Button onClick={() => setRemoving(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api.delete(`/api/me/bots/${removing!.id}`);
                setRemoving(null);
                toast("Bot deleted", "success");
                await reload();
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          >
            Delete bot
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function BotModal({ bot, onClose, onSaved }: { bot: Bot | null; onClose: () => void; onSaved: (made: { name: string; token: string } | null) => void }) {
  const toast = useToast();
  const [name, setName] = useState(bot?.name ?? "");
  const [description, setDescription] = useState(bot?.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(bot?.avatarUrl ?? "");
  const [endpoint, setEndpoint] = useState(bot?.endpoint ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(bot?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = { name: name.trim(), description: description.trim(), avatarUrl: avatarUrl || null, endpoint: endpoint.trim() || null, permissions: [...perms] };
    try {
      if (bot) {
        await api.patch(`/api/me/bots/${bot.id}`, body);
        toast("Bot saved", "success");
        onSaved(null);
      } else {
        const res = await api.post<Envelope<{ bot: Bot; token: string }>>("/api/me/bots", body);
        onSaved({ name: res.data.bot.name, token: res.data.token });
      }
    } catch (err) {
      if (isApiError(err) && err.errors) setErrors(err.errors);
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={bot ? `Edit ${bot.name}` : "New bot"} size="lg">
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} error={errors.name} />
          <ImageField kind="avatar" shape="round" label="Picture" value={avatarUrl} onChange={setAvatarUrl} fallback={<Avatar name={name || "Bot"} size={56} />} />
        </div>
        <TextArea label="What it does" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} counter={300} />
        <TextField label="Endpoint (where events are sent)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-bot.example.com/klique" error={errors.endpoint} hint="An https address. Klique POSTs signed events here; leave it empty if the bot only posts." />
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Permissions it asks for</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BOT_PERMISSIONS.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={perms.has(p.id)} onChange={(e) => setPerms((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
                <span>
                  <span className="block font-medium">{p.label}</span>
                  <span className="block text-xs text-ink-muted">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Owners choose which of these to give when they add it. Bots only ever act on people below their role. Slash commands and buttons work without Read messages, so only ask for it if your bot needs it.</p>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>
            {bot ? "Save" : "Make bot"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
