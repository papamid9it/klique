"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { BotTag } from "@/components/domain/space/WebhooksPanel";
import { useApi } from "@/lib/hooks/useApi";
import { BOT_PERMISSIONS, READ_MESSAGES } from "@/lib/roles";
import type { Envelope, UserBrief } from "@/lib/types";

const api = new ApiClient();
type Invite = {
  bot: { id: string; name: string; description: string; avatarUrl: string | null; permissions: string[]; commands: { name: string; description: string }[]; user: UserBrief | null };
  owner: UserBrief | null;
  communities: { slug: string; name: string; already: boolean; full: boolean; cap: number }[];
};

/** A bot's invite link: pick one of your communities and the permissions to give it, then add it. */
export default function BotInvitePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { status, requireAuth } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<Invite>>(`/api/bots/${id}`), [id, status], { key: `bot-invite:${id}:${status}` });
  const [community, setCommunity] = useState("");
  const [perms, setPerms] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Skeleton className="mx-auto mt-10 h-80 max-w-xl rounded-card" />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;
  // reading messages is only ever on if you tick it
  const chosen = perms ?? new Set(data.bot.permissions.filter((p) => p !== READ_MESSAGES.id));
  const places = data.communities.filter((c) => !c.already && !c.full);
  const pick = community || places[0]?.slug || "";
  return (
    <div className="mx-auto max-w-xl py-6">
      <section className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <Avatar name={data.bot.name} src={data.bot.avatarUrl} size={56} />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              {data.bot.name} <BotTag />
            </h1>
            <p className="text-sm text-ink-muted">by {data.owner?.displayName ?? "someone"}</p>
          </div>
        </div>
        {data.bot.description && <p className="mt-4 text-[15px] whitespace-pre-wrap">{data.bot.description}</p>}
        {data.bot.commands.length > 0 && (
          <div className="mt-4">
            <h2 className="eyebrow mb-1">Commands</h2>
            <ul className="space-y-1 text-sm">
              {data.bot.commands.map((c) => (
                <li key={c.name}>
                  <span className="font-mono font-semibold">/{c.name}</span> <span className="text-ink-muted">{c.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {status !== "authed" ? (
          <Button variant="primary" className="mt-6" onClick={() => requireAuth()}>
            Sign in to add it
          </Button>
        ) : !data.communities.length ? (
          <p className="mt-6 text-sm text-ink-muted">You can add bots to communities you own. You don&apos;t own one yet.</p>
        ) : (
          <div className="mt-6 space-y-4">
            <SelectField label="Add to" value={pick} onChange={(e) => setCommunity(e.target.value)}>
              {data.communities.map((c) => (
                <option key={c.slug} value={c.slug} disabled={c.already || c.full}>
                  {c.name}
                  {c.already ? " (already added)" : c.full ? ` (all ${c.cap} webhook and bot slots used)` : ""}
                </option>
              ))}
            </SelectField>
            {data.bot.permissions.length > 0 && (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">Let it</legend>
                <div className="space-y-2">
                  {BOT_PERMISSIONS.filter((p) => data.bot.permissions.includes(p.id)).map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="checkbox" checked={chosen.has(p.id)} onChange={(e) => setPerms(() => { const n = new Set(chosen); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} className="mt-0.5 size-4 accent-[var(--accent-text)]" />
                      <span>
                        <span className="block font-medium">{p.label}</span>
                        <span className="block text-xs text-ink-muted">{p.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">It gets its own role with these, just under yours. It can only act on people below that role, and you can remove it any time in community settings → Webhooks &amp; bots.</p>
              </fieldset>
            )}
            <div className="flex justify-end gap-2">
              <Button href="/">Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!pick}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api.post<Envelope<{ community: string }>>(`/api/bots/${id}/install`, { community: pick, permissions: [...chosen] });
                    toast(`${data.bot.name} added`, "success");
                    router.push(`/communities/${res.data.community}`);
                  } catch (e) {
                    toast(errorMessage(e), "error");
                    setBusy(false);
                  }
                }}
              >
                Add bot
              </Button>
            </div>
          </div>
        )}
        <p className="mt-6 text-xs text-ink-muted">
          Bots are made by other people, not Klique. Only add ones you trust. <Link href="/developers" className="underline">How bots work</Link>
        </p>
      </section>
    </div>
  );
}
