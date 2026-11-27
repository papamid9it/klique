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
import { POST_EVENTS, READ_MESSAGES } from "@/lib/roles";
import { useApi, useNow } from "@/lib/hooks/useApi";
import type { BotCommandRuleDTO, Envelope, UserBrief } from "@/lib/types";
import { cx } from "@/components/ui/cx";
import { useRoles } from "./RolesPanel";
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
/**
 * Ready-made bots first, in plain words (as in the app): the Welcome bot (Welcome message settings), Event reminders
 * (the week's events in a channel every Monday) and posting from another app (a webhook, below).
 */
function AddABot({ slug, data, onWelcome, onWebhook }: { slug: string; data: Hooks; onWelcome?: () => void; onWebhook: () => void }) {
  const toast = useToast();
  const digest = useApi(() => api.get<Envelope<{ channelId: string | null; lastAt: string | null }>>(`/api/communities/${slug}/event-digest`), [slug], { key: `event-digest:${slug}` });
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const on = digest.data?.channelId ?? null;
  const roomName = (id: string | null) => data.channels.find((c) => c.id === id)?.name ?? "a channel";
  async function save(channelId: string | null) {
    setBusy(true);
    try {
      await api.put(`/api/communities/${slug}/event-digest`, { channelId });
      toast(channelId ? `Event reminders post in #${roomName(channelId)} every Monday` : "Event reminders are off", "success");
      setOpen(false);
      await digest.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  const rows = [
    ...(onWelcome ? [{ icon: "heart" as const, label: "Welcome bot", hint: "Says hello to new members in a channel you pick", go: onWelcome }] : []),
    { icon: "calendar" as const, label: "Event reminders", hint: on ? `On · posts in #${roomName(on)} every Monday` : "Posts the week's events in a channel every Monday", go: () => (setRoom(on ?? data.channels[0]?.id ?? ""), setOpen((v) => !v)) },
    { icon: "link" as const, label: "Post from another app", hint: data.createBlock ?? `A link other apps (Zapier, GitHub, your website) can post to · ${data.cap === null ? `${data.items.length} made` : `${data.used} of ${data.cap} used`}`, go: () => !data.createBlock && onWebhook() },
  ];
  return (
    <SettingsBlock title="Add a bot" intro="Bots post for you. Klique runs the first ones; the last lets another app post here.">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.label}>
            <button type="button" onClick={r.go} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised">
              <Icon name={r.icon} size={19} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-[13px] text-ink-muted">{r.hint}</span>
              </span>
              <Icon name="chevron-right" size={15} className="text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-3 space-y-3 rounded-card border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Event reminders</p>
          <p className="text-sm text-ink-muted">Every Monday morning, this community&apos;s events for the week are posted in the channel you pick, with a link to each. A week with nothing on posts nothing.</p>
          <div className="max-w-xs">
            <SelectField label="Posts in" value={room} onChange={(e) => setRoom(e.target.value)}>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </SelectField>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => (on ? void save(null) : setOpen(false))} disabled={busy}>{on ? "Turn off" : "Cancel"}</Button>
            <Button variant="primary" loading={busy} disabled={!room} onClick={() => void save(room)}>{on ? "Save" : "Turn on"}</Button>
          </div>
        </div>
      )}
    </SettingsBlock>
  );
}

export function WebhooksPanel({ slug, onWelcome }: { slug: string; /** opens the Welcome message settings (the Welcome bot) */ onWelcome?: () => void }) {
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
      <AddABot slug={slug} data={data} onWelcome={onWelcome} onWebhook={() => setMaking(true)} />
      <SettingsBlock title="Posting from other apps" intro="A webhook is a secret link that lets another app post messages into one of your channels: alerts from Zapier, GitHub, a Google Form or your own script. Its messages show its name and picture with a BOT tag.">
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

      <BotsBlock slug={slug} channels={data.channels} />

      <SettingsBlock title="How to use it">
        <p className="mb-2 text-sm text-ink-muted">Send a POST request with JSON to the webhook&apos;s link. Only <code>content</code> is needed (up to 2000 characters). Up to 30 messages a minute.</p>
        <pre className="overflow-x-auto rounded-control border border-line bg-raised p-3 font-mono text-[12px] leading-relaxed">{`curl -X POST "YOUR_WEBHOOK_LINK" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "New event tonight at 8pm!", "username": "Event bot"}'`}</pre>
        <h4 className="mt-4 text-sm font-semibold">Connect GitHub</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>In your repo on GitHub, open Settings, then Webhooks, then Add webhook.</li>
          <li>For Payload URL, paste the webhook&apos;s link with <code>/github</code> added to the end.</li>
          <li>Choose which updates to send, then save. A message here confirms it&apos;s connected.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-muted">Pushes, pull requests, issues, comments, releases, stars and forks can show up here. These messages never ping @everyone or @here.{" "}
          <a href="/developers#github" className="font-medium text-accent-text underline">
            Full guide
          </a>
        </p>
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
          <p className="text-xs text-ink-muted">Connecting GitHub? Use Copy GitHub link, and paste it as the Payload URL in your repo&apos;s webhook settings.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${shown?.url ?? ""}/github`);
                  toast("GitHub link copied", "success");
                } catch {
                  toast("Couldn't copy. Copy the link and add /github to the end.", "error");
                }
              }}
            >
              <Icon name="copy" size={14} /> Copy GitHub link
            </Button>
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
function BotsBlock({ slug, channels }: { slug: string; channels: Hooks["channels"] }) {
  const toast = useToast();
  const { data, reload } = useApi(() => api.get<Envelope<{ id: string; name: string; description: string; avatarUrl: string | null; user: UserBrief | null; commands: { name: string; description?: string }[]; readMessages: boolean; postEvents: boolean; asksPostEvents: boolean; rules: BotCommandRuleDTO[] }[]>>(`/api/communities/${slug}/bots`), [slug], { key: `bots:${slug}` });
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [ruling, setRuling] = useState<string | null>(null);
  const ruled = data?.find((b) => b.id === ruling) ?? null;
  const [saving, setSaving] = useState<string | null>(null);
  const setAccess = async (id: string, change: { readMessages?: boolean; postEvents?: boolean }) => {
    setSaving(id);
    try {
      await api.patch(`/api/communities/${slug}/bots/${id}`, change);
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(null);
    }
  };
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
                <div className="mt-2 max-w-sm">
                  <Switch checked={b.readMessages} onChange={(v) => void setAccess(b.id, { readMessages: v })} status={saving === b.id ? "saving" : undefined} label="Can read messages" hint={READ_MESSAGES.hint} />
                </div>
                {(b.asksPostEvents || b.postEvents) && (
                  <div className="mt-2 max-w-sm">
                    <Switch checked={b.postEvents} onChange={(v) => void setAccess(b.id, { postEvents: v })} status={saving === b.id ? "saving" : undefined} label="Can post events" hint={POST_EVENTS.hint} />
                  </div>
                )}
                {b.commands.length > 0 && (
                  <button type="button" onClick={() => setRuling(b.id)} className="mt-2 text-sm font-medium text-accent-text underline underline-offset-2">
                    Who can use its commands{b.rules.some((r) => r.who !== "everyone" || r.channelIds.length || r.cooldownSec) ? " (limited)" : " (everyone)"}
                  </button>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemoving({ id: b.id, name: b.name })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {ruled && <CommandRules slug={slug} bot={ruled} channels={channels} onClose={() => setRuling(null)} onSaved={() => void reload()} />}
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

const COOLDOWN_CHOICES: [number, string][] = [[0, "No wait"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"], [600, "10 minutes"], [3600, "1 hour"]];

/** For each of a bot's commands: who may use it, in which channels, and how often. Everyone, everywhere, no wait unless set. */
function CommandRules({ slug, bot, channels, onClose, onSaved }: { slug: string; bot: { id: string; name: string; commands: { name: string; description?: string }[]; rules: BotCommandRuleDTO[] }; channels: Hooks["channels"]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const roles = useRoles(slug).data?.items ?? [];
  const [rules, setRules] = useState<BotCommandRuleDTO[]>(() => bot.commands.map((c) => bot.rules.find((r) => r.command === c.name) ?? { command: c.name, who: "everyone", roleIds: [], channelIds: [], cooldownSec: 0 }));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<BotCommandRuleDTO>) => setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const chip = (on: boolean) => cx("h-8 rounded-control border px-3 text-[13px] font-medium transition", on ? "border-ink bg-ink text-canvas" : "border-line bg-surface hover:bg-raised");
  async function save() {
    if (rules.some((r) => r.who === "roles" && !r.roleIds.length)) return toast("Pick at least one role, or choose Everyone.", "error");
    setBusy(true);
    try {
      await api.patch(`/api/communities/${slug}/bots/${bot.id}`, { rules });
      toast("Saved", "success");
      onSaved();
      onClose();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Who can use ${bot.name}`} description="By default everyone who can post in a channel can use every command. The owner, admins and moderators can always use them and never wait." size="lg">
      <div className="space-y-5">
        {rules.map((r, i) => (
          <section key={r.command} className="space-y-3 rounded-card border border-line p-4">
            <p className="font-mono text-sm font-semibold">/{r.command}<span className="ml-2 font-sans font-normal text-ink-muted">{bot.commands[i]?.description}</span></p>
            <SelectField label="Who can use it" value={r.who} onChange={(e) => set(i, { who: e.target.value as BotCommandRuleDTO["who"] })}>
              <option value="everyone">Everyone</option>
              <option value="mods">Owner, admins and moderators</option>
              <option value="roles">People with certain roles</option>
            </SelectField>
            {r.who === "roles" && (
              <div className="flex flex-wrap gap-1.5">
                {roles.length ? roles.map((ro) => <button key={ro.id} type="button" aria-pressed={r.roleIds.includes(ro.id)} onClick={() => set(i, { roleIds: flip(r.roleIds, ro.id) })} className={chip(r.roleIds.includes(ro.id))}>{ro.name}</button>) : <p className="text-sm text-ink-muted">No roles yet. Make some in Roles.</p>}
              </div>
            )}
            <div>
              <p className="text-[13px] font-medium">Where</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!r.channelIds.length} onClick={() => set(i, { channelIds: [] })} className={chip(!r.channelIds.length)}>Every channel</button>
                {channels.map((ch) => <button key={ch.id} type="button" aria-pressed={r.channelIds.includes(ch.id)} onClick={() => set(i, { channelIds: flip(r.channelIds, ch.id) })} className={chip(r.channelIds.includes(ch.id))}>#{ch.name}</button>)}
              </div>
            </div>
            <SelectField label="Each person can use it once every" value={r.cooldownSec} onChange={(e) => set(i, { cooldownSec: Number(e.target.value) })} hint="Stops one person filling a channel with the bot's answers.">
              {COOLDOWN_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
          </section>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </Modal>
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
