"use client";

import { useEffect, useState } from "react";
import ApiClient, { errorMessage } from "@/app/ApiCore";
import { ChannelService } from "@/app/services/ChannelService";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { SelectField, Switch, TextArea, TextField } from "@/components/ui/Field";
import { SaveBar, SettingsBlock } from "@/components/ui/SettingsShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { formatTime } from "@/lib/format";
import { useApi } from "@/lib/hooks/useApi";
import type { AutoModAction, AutoModConfig } from "@/lib/automod";
import type { Envelope } from "@/lib/types";
import { RoleChip, useRoles } from "./RolesPanel";

const api = new ApiClient();
type State = { config: AutoModConfig; raidUntil: string | null; raidMode: "pause" | "approval" | null };

const TIMEOUT_CHOICES = [
  [0, "No timeout"],
  [60, "60 seconds"],
  [300, "5 minutes"],
  [600, "10 minutes"],
  [3600, "1 hour"],
  [86_400, "1 day"],
  [604_800, "1 week"],
] as const;

/** What a rule does when it fires: block, alert, time out. */
function ActionPicker({ value, onChange, canAlert }: { value: AutoModAction; onChange: (a: AutoModAction) => void; canAlert: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-raised/60 px-3 py-2 text-[13px]">
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={value.block} onChange={(e) => onChange({ ...value, block: e.target.checked })} className="size-4 accent-[var(--accent-text)]" /> Block it
      </label>
      <label className="inline-flex items-center gap-2" title={canAlert ? undefined : "Pick an alert channel first"}>
        <input type="checkbox" checked={value.alert} disabled={!canAlert} onChange={(e) => onChange({ ...value, alert: e.target.checked })} className="size-4 accent-[var(--accent-text)]" /> Alert mods
      </label>
      <select value={value.timeoutSec} onChange={(e) => onChange({ ...value, timeoutSec: Number(e.target.value) })} aria-label="Time them out" className="h-8 rounded-control border border-line bg-surface px-2 text-[13px]">
        {TIMEOUT_CHOICES.map(([s, l]) => (
          <option key={s} value={s}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/**
 * Community settings → AutoMod (owners and admins): rules checked on every chat message, board post and comment,
 * and feed post and comment before it goes up, each with its own action; plus raid protection for joins.
 */
export function AutoModPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get<Envelope<State>>(`/api/communities/${slug}/automod`), [slug], { key: `automod:${slug}` });
  const channels = useApi(() => ChannelService.list({ slug }), [slug], { key: `automod-ch:${slug}` });
  const roles = useRoles(slug);
  const [cfg, setCfg] = useState<AutoModConfig | null>(null);
  const [words, setWords] = useState("");
  const [blockList, setBlockList] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setCfg(data.config);
    setWords(data.config.words.list.join("\n"));
    setBlockList(data.config.links.blockList.join("\n"));
  }, [data]);
  if ((loading && !data) || (data && !cfg)) return <Skeleton className="h-80 w-full rounded-card" />;
  if (error || !data || !cfg) return <ErrorState message={error} onRetry={reload} />;

  const next: AutoModConfig = { ...cfg, words: { ...cfg.words, list: lines(words) }, links: { ...cfg.links, blockList: lines(blockList) } };
  const dirty = JSON.stringify(next) !== JSON.stringify(data.config);
  const set = <K extends keyof AutoModConfig>(k: K, v: AutoModConfig[K]) => setCfg({ ...cfg, [k]: v });
  const textChannels = (channels.data?.channels ?? []).filter((c) => c.type !== "voice");
  const canAlert = !!cfg.alertChannelId;
  const roleList = (roles.data?.items ?? []).filter((r) => r.builtin !== "admin");
  const toggleIn = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  async function save() {
    setBusy(true);
    try {
      await api.put(`/api/communities/${slug}/automod`, next);
      toast(next.enabled ? "AutoMod saved" : "AutoMod is off", "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  async function endLock() {
    try {
      await api.delete(`/api/communities/${slug}/automod/raid`);
      toast("Joining is back to normal", "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      {data.raidUntil && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-4 text-sm">
          <span className="flex-1">
            <strong>Raid protection is on</strong> until {formatTime(data.raidUntil)}: {data.raidMode === "pause" ? "nobody can join." : "new people have to ask (see Join requests)."}
          </span>
          <Button size="sm" onClick={() => void endLock()}>
            End it now
          </Button>
        </div>
      )}
      <SettingsBlock title="AutoMod" intro="Checks every chat message, board post and comment, and post and comment here before it goes up. Owners and admins are never checked.">
        <Switch checked={cfg.enabled} onChange={(v) => set("enabled", v)} label="AutoMod on" />
        <div className="mt-4 max-w-sm">
          <SelectField label="Alert channel" value={cfg.alertChannelId ?? ""} onChange={(e) => set("alertChannelId", e.target.value || null)} hint="Where AutoMod posts what it did (a staff channel is best).">
            <option value="">No alerts</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </SelectField>
        </div>
      </SettingsBlock>

      <fieldset disabled={!cfg.enabled} className="space-y-0 disabled:opacity-60">
        <SettingsBlock title="Spam and scam links">
          <Switch checked={cfg.links.on} onChange={(v) => set("links", { ...cfg.links, on: v })} label="Check links" />
          <div className="mt-3 space-y-3">
            <Switch checked={cfg.links.scamFilter} onChange={(v) => set("links", { ...cfg.links, scamFilter: v })} label="Catch common scams" hint={`"Free crypto / airdrop", "double your money", IP-grabber and fake login links.`} />
            <TextArea label="Blocked sites" value={blockList} onChange={(e) => setBlockList(e.target.value)} rows={3} placeholder={"example.com\nbit.ly"} hint="One per line. Links to these sites (and their subdomains) are caught." />
            <SelectField label="Links from new members" value={cfg.links.newMemberMinutes} onChange={(e) => set("links", { ...cfg.links, newMemberMinutes: Number(e.target.value) })} hint="Stop any link from people who only just joined.">
              {[[0, "Allowed"], [10, "Not in their first 10 minutes"], [60, "Not in their first hour"], [1440, "Not in their first day"], [10_080, "Not in their first week"]].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            <ActionPicker value={cfg.links.action} onChange={(a) => set("links", { ...cfg.links, action: a })} canAlert={canAlert} />
          </div>
        </SettingsBlock>

        <SettingsBlock title="Banned words">
          <Switch checked={cfg.words.on} onChange={(v) => set("words", { ...cfg.words, on: v })} label="Check for banned words" />
          <div className="mt-3 space-y-3">
            <TextArea label="Words" value={words} onChange={(e) => setWords(e.target.value)} rows={4} placeholder={"one per line\nscam*"} hint="Whole words, any case. Use * for any ending: scam* catches scammer and scams." />
            <ActionPicker value={cfg.words.action} onChange={(a) => set("words", { ...cfg.words, action: a })} canAlert={canAlert} />
          </div>
        </SettingsBlock>

        <SettingsBlock title="Mention spam">
          <Switch checked={cfg.mentions.on} onChange={(v) => set("mentions", { ...cfg.mentions, on: v })} label="Stop mass mentions" />
          <div className="mt-3 space-y-3">
            <div className="max-w-[12rem]">
              <TextField label="More than this many @people" type="number" min={2} max={50} value={cfg.mentions.max} onChange={(e) => set("mentions", { ...cfg.mentions, max: Number(e.target.value) || 8 })} />
            </div>
            <ActionPicker value={cfg.mentions.action} onChange={(a) => set("mentions", { ...cfg.mentions, action: a })} canAlert={canAlert} />
          </div>
        </SettingsBlock>

        <SettingsBlock title="Repeated messages">
          <Switch checked={cfg.flood.on} onChange={(v) => set("flood", { ...cfg.flood, on: v })} label="Stop the same message again and again" hint="In chat: the same text this many times within 2 minutes." />
          <div className="mt-3 space-y-3">
            <div className="max-w-[12rem]">
              <TextField label="Times" type="number" min={2} max={20} value={cfg.flood.repeats} onChange={(e) => set("flood", { ...cfg.flood, repeats: Number(e.target.value) || 4 })} />
            </div>
            <ActionPicker value={cfg.flood.action} onChange={(a) => set("flood", { ...cfg.flood, action: a })} canAlert={canAlert} />
          </div>
        </SettingsBlock>

        <SettingsBlock title="Raid protection" intro="When lots of people join at once (often bots), lock joining for a while and tell the owner and admins. Invite links still work.">
          <Switch checked={cfg.raid.on} onChange={(v) => set("raid", { ...cfg.raid, on: v })} label="Watch for raids" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField label="Joins" type="number" min={3} max={500} value={cfg.raid.joins} onChange={(e) => set("raid", { ...cfg.raid, joins: Number(e.target.value) || 15 })} />
            <TextField label="Within (minutes)" type="number" min={1} max={120} value={cfg.raid.minutes} onChange={(e) => set("raid", { ...cfg.raid, minutes: Number(e.target.value) || 5 })} />
            <SelectField label="Then" value={cfg.raid.mode} onChange={(e) => set("raid", { ...cfg.raid, mode: e.target.value as "pause" | "approval" })}>
              <option value="approval">New people have to ask to join</option>
              <option value="pause">Pause joining</option>
            </SelectField>
            <SelectField label="For" value={cfg.raid.lockMinutes} onChange={(e) => set("raid", { ...cfg.raid, lockMinutes: Number(e.target.value) })}>
              {[[15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [180, "3 hours"], [720, "12 hours"], [1440, "1 day"]].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
          </div>
        </SettingsBlock>

        <SettingsBlock title="Skip these" intro="AutoMod doesn't check people with these roles, or these channels.">
          {roleList.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {roleList.map((r) => (
                <label key={r.id} className="inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={cfg.exemptRoleIds.includes(r.id)} onChange={(e) => set("exemptRoleIds", toggleIn(cfg.exemptRoleIds, r.id, e.target.checked))} className="size-4 accent-[var(--accent-text)]" />
                  <RoleChip role={r} />
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {textChannels.map((c) => (
              <label key={c.id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={cfg.exemptChannelIds.includes(c.id)} onChange={(e) => set("exemptChannelIds", toggleIn(cfg.exemptChannelIds, c.id, e.target.checked))} className="size-4 accent-[var(--accent-text)]" />#{c.name}
              </label>
            ))}
          </div>
        </SettingsBlock>
      </fieldset>
      <SaveBar dirty={dirty} busy={busy} onReset={() => data && (setCfg(data.config), setWords(data.config.words.list.join("\n")), setBlockList(data.config.links.blockList.join("\n")))} onSave={() => void save()} />
    </>
  );
}
