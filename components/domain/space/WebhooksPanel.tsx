"use client";

import { useState } from "react";
import ApiClient, { errorMessage, isApiError } from "@/app/ApiCore";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { Modal } from "@/components/ui/Modal";
import { SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { relativeStamp } from "@/lib/format";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { Envelope, UserBrief } from "@/lib/types";
import { ConfirmModal } from "./parts";
import { useConfirm } from "@/components/providers/ConfirmProvider";

const api = new ApiClient();

interface Hook {
  id: string;
  name: string;
  avatarUrl: string | null;
  channel: { id: string; name: string; slug: string } | null;
  allowMassMention: boolean;
  createdBy: UserBrief | null;
  lastUsedAt: string | null;
  createdAt: string;
}
interface Hooks {
  items: Hook[];
  createBlock: string | null;
  channels: { id: string; name: string; slug: string }[];
  cap: number | null;
  used: number;
}

/**
 * Community settings → Webhooks: secret links that let outside tools (Zapier, GitHub, a script) post into a
 * channel, shown with a BOT tag. Make, copy, renew and delete them; the secret link is only shown when it's made or
 * renewed. The community's owner only; how many is set by their plan (Free 2, Lite 5, Pro 10). Webhooks belong
 * to the community, so they keep working if it changes owner.
 */
export function WebhooksPanel({ slug }: { slug: string }) {
  const [busy, setBusy] = useState<{ id: string; what: "mass" | "renew" } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<Hooks>>(`/api/communities/${slug}/webhooks`), [slug], { key: `webhooks:${slug}` });
  const [making, setMaking] = useState(false);
  const [shown, setShown] = useState<{ name: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<Hook | null>(null);

  async function renew(h: Hook) {
    if (!(await confirm({ title: "Make a new link?", body: "The old link stops working straight away; anything using it must get the new one.", confirmLabel: "New link" }))) return;
    setBusy({ id: h.id, what: "renew" });
    try {
      const res = await api.patch<Envelope<{ webhook: Hook; url: string | null }>>(`/api/communities/${slug}/webhooks/${h.id}`, { regenerate: true });
      if (res.data.url) setShown({ name: h.name, url: res.data.url });
      toast("New link made. The old one stopped working.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }
  async function setMass(h: Hook, on: boolean) {
    setBusy({ id: h.id, what: "mass" });
    try {
      await api.patch(`/api/communities/${slug}/webhooks/${h.id}`, { allowMassMention: on });
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <Skeleton className="h-60 w-full rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <SettingsBlock title="Webhooks" intro="A webhook is a secret link that lets another app post messages into one of your channels: alerts from Zapier, GitHub, a Google Form or your own script. Its messages show its name and picture with a BOT tag.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => setMaking(true)} disabled={!!data.createBlock}>
            <Icon name="plus" size={14} /> New webhook
          </Button>
          <span className="text-xs text-ink-muted">
            {data.cap === null ? `${data.items.length} made · no limit` : `${data.used} of ${data.cap} used (webhooks and bots)`}
          </span>
        </div>
        {data.createBlock && (
          <p className="mt-2 text-sm text-ink-muted">
            {data.createBlock}{" "}
            {/Upgrade/.test(data.createBlock) && (
              <a href="/pricing" className="font-medium text-accent-text underline">
                See plans
              </a>
            )}
          </p>
        )}
      </SettingsBlock>

      <SettingsBlock>
        {data.items.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {data.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={h.name} src={h.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{h.name}</span>
                    <BotTag />
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    Posts in #{h.channel?.name ?? "deleted channel"} · made by {h.createdBy?.displayName ?? "someone"} · {h.lastUsedAt && now ? `last used ${relativeStamp(h.lastUsedAt, now)}` : "not used yet"}
                  </p>
                  <div className="mt-2 max-w-sm">
                    <Switch checked={h.allowMassMention} onChange={(v) => void setMass(h, v)} status={busy?.id === h.id && busy.what === "mass" ? "saving" : undefined} label="Can ping @everyone and @here" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void renew(h)} loading={busy?.id === h.id && busy.what === "renew"}>
                    New link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(h)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="link" title="No webhooks yet">
            Make one, then paste its link into the other app.
          </EmptyState>
        )}
      </SettingsBlock>

      <BotsBlock slug={slug} />

      <SettingsBlock title="How to use it">
        <p className="mb-2 text-sm text-ink-muted">Send a POST request with JSON to the webhook&apos;s link. Only <code>content</code> is needed (up to 2000 characters). Up to 30 messages a minute.</p>
        <pre className="overflow-x-auto rounded-control border border-line bg-raised p-3 font-mono text-[12px] leading-relaxed">{`curl -X POST "YOUR_WEBHOOK_LINK" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "New event tonight at 8pm!", "username": "Event bot"}'`}</pre>
        <p className="mt-2 text-xs text-ink-muted">Keep the link secret: anyone with it can post as this webhook. If it leaks, press New link and the old one stops working. Only you, the owner, can manage webhooks. They belong to the community, so they keep working if you hand it to a new owner.</p>
      </SettingsBlock>

      {making && (
        <NewWebhook
          slug={slug}
          channels={data.channels}
          onClose={() => setMaking(false)}
          onMade={async (name, url) => {
            setMaking(false);
            setShown({ name, url });
            await reload();
          }}
        />
      )}
      <Modal open={!!shown} onClose={() => setShown(null)} title={`${shown?.name ?? "Webhook"}'s link`} description="Copy it now: for safety it won't be shown again. Paste it into the other app." size="sm">
        <div className="space-y-3">
          <input readOnly value={shown?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="h-10 w-full rounded-control border border-line bg-raised px-3 font-mono text-[12px]" aria-label="Webhook link" />
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shown?.url ?? "");
                  toast("Link copied", "success");
                } catch {
                  toast("Couldn't copy. Select the link and copy it.", "error");
                }
              }}
            >
              <Icon name="copy" size={14} /> Copy link
            </Button>
            <Button onClick={() => setShown(null)}>Done</Button>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.name ?? "this webhook"}?`}
        description="Its link stops working straight away. Messages it already posted stay."
        confirmLabel="Delete webhook"
        onConfirm={async () => {
          await api.delete(`/api/communities/${slug}/webhooks/${removing!.id}`);
          setRemoving(null);
          toast("Webhook deleted", "success");
          await reload();
        }}
      />
    </>
  );
}

/** The community's bots (added with their invite links), each removable. */
function BotsBlock({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, reload } = useApi(() => api.get<Envelope<{ id: string; name: string; description: string; avatarUrl: string | null; user: UserBrief | null; commands: { name: string }[] }[]>>(`/api/communities/${slug}/bots`), [slug], { key: `bots:${slug}` });
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  return (
    <SettingsBlock title="Bots" intro="Bots are added with their invite link (a bot's maker shares it). They count towards the same limit as webhooks. Each gets its own role you can adjust in Roles.">
      {!data?.length ? (
        <p className="text-sm text-ink-muted">No bots yet.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {data.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={b.name} src={b.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{b.name}</span>
                  <BotTag />
                </p>
                <p className="truncate text-xs text-ink-muted">{b.commands.length ? b.commands.map((c) => `/${c.name}`).join(" ") : b.description || `@${b.user?.handle ?? ""}`}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemoving({ id: b.id, name: b.name })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? "this bot"}?`}
        description="It leaves the community and its role goes. You can add it again with its invite link."
        confirmLabel="Remove bot"
        onConfirm={async () => {
          await api.delete(`/api/communities/${slug}/bots/${removing!.id}`);
          setRemoving(null);
          toast("Bot removed", "success");
          await reload();
        }}
      />
    </SettingsBlock>
  );
}

export function BotTag() {
  return <span className="rounded bg-accent px-1 py-px font-mono text-[9.5px] leading-none font-bold tracking-wide text-accent-ink">BOT</span>;
}

function NewWebhook({ slug, channels, onClose, onMade }: { slug: string; channels: Hooks["channels"]; onClose: () => void; onMade: (name: string, url: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <Modal open onClose={onClose} title="New webhook" description="Pick the channel it posts in and how its messages look." size="sm">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErrors({});
          try {
            const res = await api.post<Envelope<{ webhook: Hook; url: string }>>(`/api/communities/${slug}/webhooks`, { name: name.trim(), channelId, avatarUrl: avatarUrl || null });
            onMade(res.data.webhook.name, res.data.url);
          } catch (err) {
            if (isApiError(err) && err.errors) setErrors(err.errors);
            toast(errorMessage(err), "error");
            setBusy(false);
          }
        }}
      >
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Event alerts" error={errors.name} />
        <SelectField label="Posts in" value={channelId} onChange={(e) => setChannelId(e.target.value)} error={errors.channelId}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </SelectField>
        <ImageField kind="avatar" shape="round" label="Picture (optional)" value={avatarUrl} onChange={setAvatarUrl} fallback={<Avatar name={name || "Bot"} size={64} />} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || !channelId}>
            Make webhook
          </Button>
        </div>
      </form>
    </Modal>
  );
}
