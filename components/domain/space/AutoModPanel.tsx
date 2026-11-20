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
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

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

type Level = "relaxed" | "balanced" | "strict";
const a = (block: boolean, alert: boolean, timeoutSec = 0) => ({ block, alert, timeoutSec });
/** The three ready-made strengths, the same as the app's: what each switches on (alerts, skipped roles and channels, and word lists stay yours) */
function preset(level: Level, cfg: AutoModConfig): AutoModConfig {
  const base = { ...cfg, enabled: true };
  if (level === "relaxed")
    return { ...base, links: { ...cfg.links, on: true, scamFilter: true, blockAll: false, newMemberMinutes: 0, action: a(true, true) }, mentions: { on: true, max: 15, action: a(true, true) }, flood: { on: false, repeats: 5, action: a(true, false) }, raid: { ...cfg.raid, on: false } };
  if (level === "balanced")
    return { ...base, links: { ...cfg.links, on: true, scamFilter: true, blockAll: false, newMemberMinutes: 10, action: a(true, true) }, mentions: { on: true, max: 8, action: a(true, true, 600) }, flood: { on: true, repeats: 4, action: a(true, false, 300) }, raid: { ...cfg.raid, on: true, joins: 15, minutes: 5, mode: "approval", lockMinutes: 30 } };
  return { ...base, links: { ...cfg.links, on: true, scamFilter: true, blockAll: true, newMemberMinutes: 60, action: a(true, true) }, words: { ...cfg.words, on: true }, mentions: { on: true, max: 5, action: a(true, true, 600) }, flood: { on: true, repeats: 3, action: a(true, false, 600) }, raid: { ...cfg.raid, on: true, joins: 10, minutes: 5, mode: "approval", lockMinutes: 60 } };
}
/** which strength these settings are, if they match one exactly */
function levelOf(cfg: AutoModConfig): Level | "custom" {
  const key = (c: AutoModConfig) => JSON.stringify([c.links.scamFilter, c.links.blockAll, c.links.newMemberMinutes, c.links.on, c.mentions, c.flood, c.raid.on, c.raid.on ? [c.raid.joins, c.raid.minutes, c.raid.mode, c.raid.lockMinutes] : null]);
  for (const l of ["relaxed", "balanced", "strict"] as Level[]) if (key(preset(l, cfg)) === key(cfg)) return l;
  return "custom";
}
const LEVELS: { id: Level; label: string; points: string[] }[] = [
  { id: "relaxed", label: "Relaxed", points: ["Blocks scam links", "Stops someone pinging lots of people at once"] },
  { id: "balanced", label: "Balanced", points: ["Everything in Relaxed", "New members can't post links for 10 minutes", "Mutes someone sending the same message over and over", "Asks you to approve people if many join at once"] },
  { id: "strict", label: "Strict", points: ["Everything in Balanced", "No links at all (admins and roles you skip still can)", "Turns on your list of words you don't allow"] },
];

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
  const [custom, setCustom] = useState(false);
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
      toast(next.enabled ? "Auto-filters saved" : "Auto-filters are off", "success");
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
      <SettingsBlock title="Auto-filters" intro="Stops spam, scam links and bad words before anyone sees them, in chat, on the board and in posts and comments. Owners and admins are never checked.">
        <Switch checked={cfg.enabled} onChange={(v) => setCfg(v && levelOf(cfg) === "custom" && !data.config.enabled ? preset("balanced", cfg) : { ...cfg, enabled: v })} label="Auto-filters on" />
      </SettingsBlock>
      {/* how strict, in one choice; the rules themselves are under Customise */}
      <SettingsBlock title="How strict?">
        <div role="radiogroup" aria-label="How strict?" className={cx("space-y-2", !cfg.enabled && "pointer-events-none opacity-50")}>
          {LEVELS.map((l) => {
            const on = levelOf(cfg) === l.id;
            return (
              <button key={l.id} type="button" role="radio" aria-checked={on} onClick={() => setCfg(preset(l.id, cfg))} className={cx("flex w-full gap-3 rounded-card bg-surface p-4 text-left transition hover:bg-raised", on ? "border-2 border-ink p-[15px]" : "border border-line")}>
                <span aria-hidden="true" className={cx("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-ink" : "border-ink-muted")}>{on && <span className="size-2.5 rounded-full bg-ink" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[15px] font-semibold">
                    {l.label}
                    {l.id === "balanced" && <span className="rounded-[5px] bg-accent px-1.5 text-[12px] font-bold text-accent-ink">Recommended</span>}
                  </span>
                  {l.points.map((x) => <span key={x} className="block text-sm text-ink-muted">• {x}</span>)}
                </span>
              </button>
            );
          })}
          {levelOf(cfg) === "custom" && cfg.enabled && <p className="text-sm text-ink-muted">Your own mix (changed under Customise). Pick one above to use it instead.</p>}
        </div>
        <div className="mt-4 max-w-sm">
          <SelectField label="Where alerts go" value={cfg.alertChannelId ?? ""} onChange={(e) => set("alertChannelId", e.target.value || null)} hint="A channel where it tells you what it stopped (a staff channel is best).">
            <option value="">No alerts</option>
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </SelectField>
        </div>
      </SettingsBlock>

      <button type="button" onClick={() => setCustom((v) => !v)} aria-expanded={custom} className="mb-6 flex h-11 w-full items-center justify-between rounded-control border border-line bg-surface px-3.5 text-sm font-semibold hover:bg-raised">
        {custom ? "Hide the details" : "Customise"}
        <Icon name={custom ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      <fieldset disabled={!cfg.enabled} hidden={!custom} className="space-y-0 disabled:opacity-60">
        <SettingsBlock title="Links">
          <Switch checked={cfg.links.on} onChange={(v) => set("links", { ...cfg.links, on: v })} label="Check links" />
          <div className="mt-3 space-y-3">
            <Switch checked={cfg.links.blockAll} onChange={(v) => set("links", { ...cfg.links, blockAll: v })} label="Block all links" hint="Nobody can post a link. Owners, admins and the roles you skip below still can." />
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

        <SettingsBlock title="Pinging lots of people">
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

        <SettingsBlock title="Many people joining at once" intro="When lots of people join at once (often bots), lock joining for a while and tell the owner and admins. Invite links still work.">
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

        <SettingsBlock title="Skip these" intro="Auto-filters don't check people with these roles, or these channels.">
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
