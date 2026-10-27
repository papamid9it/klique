"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileBanner } from "@/components/domain/profile/ProfileParts";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ProfileEffect, useEffectsCatalog } from "@/components/ui/ProfileEffect";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { themeStyle } from "@/components/ui/profileTheme";
import { FRAMES, NAME_EFFECTS, STYLE_COLORS, THEME_PRESETS, isAnimatedPicture } from "@/lib/cosmetics";
import type { ProfileEffectDTO } from "@/lib/types";
import type { StyleKey } from "@/lib/wallet";

/** What the preview card shows: the person as they'd look with the design being tried. */
export interface CardLook {
  name: string;
  handle: string;
  avatarUrl: string | null;
  avatarFrame: string;
  nameEffect: string;
  theme: { primary: string; accent: string } | null;
  effect: string;
  bannerUrl: string;
  bannerColor: string;
}

/** Whether a design is theirs: its price, and whether it's locked. */
export type Access = { price: number; locked: boolean } | null;
type AccessOf = (key: StyleKey) => Access;

/** A profile popout as others will see it, for the right side of the pop-ups. */
export function PreviewCard({ look, effectSpec }: { look: CardLook; effectSpec?: ProfileEffectDTO | null }) {
  return (
    <div className="relative w-full max-w-[300px] overflow-hidden rounded-card border border-line bg-surface shadow-2xl" style={themeStyle(look.theme)}>
      <ProfileEffect id={effectSpec ? null : look.effect} spec={effectSpec} />
      <ProfileBanner handle={look.handle} bannerUrl={look.bannerUrl} bannerColor={look.bannerColor} className="relative h-[72px]" />
      <div className="relative px-4 pb-5">
        <span className="-mt-11 inline-block rounded-full bg-surface p-1.5">
          <Avatar name={look.name} src={look.avatarUrl} frame={look.avatarFrame || null} size={80} />
        </span>
        <p className="mt-2 truncate text-xl font-semibold tracking-[-0.02em]">
          <UserName name={look.name} effect={look.nameEffect} />
        </p>
        <p className="font-mono text-xs text-ink-muted">@{look.handle}</p>
        <div className="mt-4 space-y-2">
          <span className="block h-2.5 w-4/5 rounded-full bg-raised" />
          <span className="block h-2.5 w-3/5 rounded-full bg-raised" />
        </div>
      </div>
    </div>
  );
}

const hex = (h: number) => {
  // a bright, readable colour at hue `h` (HSL 90% saturation, 60% lightness)
  const s = 0.9,
    l = 0.6;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/** A colour: a hue slider, a few swatches, and any colour. */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  const [hue, setHue] = useState(0);
  return (
    <div className="space-y-2">
      <p className="flex items-center justify-between text-[12px] font-semibold text-ink-muted">
        {label}
        <span className="inline-flex items-center gap-1.5 font-mono font-normal">
          <span className="size-3.5 rounded-full border border-line" style={{ background: value }} /> {value}
        </span>
      </p>
      <input
        type="range"
        min={0}
        max={359}
        value={hue}
        aria-label={`${label}: hue`}
        onChange={(e) => {
          setHue(Number(e.target.value));
          onChange(hex(Number(e.target.value)));
        }}
        className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent"
        style={{ background: "linear-gradient(90deg, #ff4d4d, #ffd60a, #3bff8f, #22d3ee, #4d7cff, #a855f7, #ff2bd6, #ff4d4d)" }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {STYLE_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} aria-pressed={value.toLowerCase() === c} onClick={() => onChange(c)} style={{ background: c }} className={cx("size-6 rounded-full border-2", value.toLowerCase() === c ? "border-ink" : "border-line")} />
        ))}
        <input type="color" aria-label={`${label}: any colour`} value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded-full border border-line bg-transparent p-0" />
      </div>
    </div>
  );
}

/**
 * Save, or (locked) unlock first: the footer of every pop-up. "Try on" keeps the pick on the preview (with whatever
 * else is being tried) without saving or paying, to see designs together before unlocking them.
 */
function Footer({ access, onCancel, onSave, onUnlock, onTry, busy, disabled }: { access: Access; onCancel: () => void; onSave: () => void; onUnlock: () => void; onTry?: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
      {access?.locked && <span className="mr-auto text-[13px] text-ink-muted">Preview, only you can see this. Yours for 30 days for {access.price.toLocaleString("en-NG")} Hype.</span>}
      <Button onClick={onCancel}>Cancel</Button>
      {onTry && !disabled && (
        <Button onClick={onTry}>
          <Icon name="eye" size={14} /> Try on
        </Button>
      )}
      {access?.locked ? (
        <Button variant="primary" onClick={onUnlock}>
          <Icon name="lock" size={14} /> Unlock · {access.price.toLocaleString("en-NG")} Hype
        </Button>
      ) : (
        <Button variant="primary" onClick={onSave} loading={busy} disabled={disabled}>
          Save
        </Button>
      )}
    </div>
  );
}

/** The lock and price (or "Yours") on a tile. */
function TileTag({ a }: { a: Access }) {
  if (!a || a.price === 0) return null;
  return a.locked ? (
    <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-canvas">
      <Icon name="lock" size={10} /> {a.price}
    </span>
  ) : (
    <span className="absolute top-1.5 right-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">Yours</span>
  );
}

interface Option {
  /** what's saved ("" for none) */
  value: string;
  label: string;
  tile: React.ReactNode;
  /** the unlock it needs (none: free) */
  key?: StyleKey;
}

/** Saving from a pop-up: shared busy state and error toast. */
function useSave(onSave: (v: string) => Promise<void>, onClose: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    save: async (v: string) => {
      setBusy(true);
      try {
        await onSave(v);
        onClose();
      } catch (e) {
        toast(errorMessage(e), "error");
      } finally {
        setBusy(false);
      }
    },
  };
}

/**
 * A Discord-style picker: a grid of options on the left (each previews in its tile), the profile card with the
 * picked one on the right, then Save (or Unlock when it isn't theirs yet). `extra` goes under the grid.
 */
function PickModal({ title, options, current, saved, lookWith, accessOf, onSave, onUnlock, onTry, onClose, cols = "grid-cols-2 sm:grid-cols-3", extra, keyFor }: { title: string; options: Option[]; current: string; saved: string; lookWith: (v: string) => CardLook; accessOf: AccessOf; onSave: (v: string) => Promise<void>; onUnlock: (key: StyleKey) => void; onTry: (v: string) => void; onClose: () => void; cols?: string; extra?: (v: string, set: (v: string) => void) => React.ReactNode; keyFor?: (v: string) => StyleKey | undefined }) {
  const [pick, setPick] = useState(current);
  const { busy, save } = useSave(onSave, onClose);
  // the unlock the pick needs: from its tile, or (a value with no tile, like their own colours) from `keyFor`
  const need = options.find((o) => o.value === pick)?.key ?? keyFor?.(pick);
  const access = need ? accessOf(need) : null;
  return (
    <Modal open onClose={onClose} title={title} size="xl">
      <div className="kq-live grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className={cx("grid gap-2", cols)} role="radiogroup" aria-label={title}>
            {options.map((o) => (
              <button key={o.value || "none"} type="button" role="radio" aria-checked={pick === o.value} onClick={() => setPick(o.value)} className={cx("relative flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-control border px-2 py-3 text-center transition", pick === o.value ? "border-accent bg-accent/10" : "border-line bg-raised/40 hover:bg-raised")}>
                <TileTag a={o.key ? accessOf(o.key) : null} />
                <span className="flex max-w-full flex-col items-center">{o.tile}</span>
                <span className="text-[11px] font-medium text-ink-muted">{o.label}</span>
              </button>
            ))}
          </div>
          {extra?.(pick, setPick)}
        </div>
        <div className="order-first flex flex-col items-center gap-2 md:order-none">
          <p className="eyebrow self-start md:self-center">Preview</p>
          <PreviewCard look={lookWith(pick)} />
        </div>
      </div>
      <Footer
        access={access}
        onCancel={onClose}
        onSave={() => void save(pick)}
        onUnlock={() => {
          onTry(pick); // it stays on the preview while they unlock
          if (need) onUnlock(need);
        }}
        onTry={() => (onTry(pick), onClose())}
        busy={busy}
        disabled={pick === saved}
      />
    </Modal>
  );
}

export interface PickerProps {
  /** the person with what they're trying on (the pickers open on it) */
  look: CardLook;
  /** what this picker's design is saved as now ("" for none) */
  saved: string;
  accessOf: AccessOf;
  onSave: (v: string) => Promise<void>;
  onUnlock: (key: StyleKey) => void;
  /** keep this pick on the preview without saving it */
  onTry: (v: string) => void;
  onClose: () => void;
}

/** Name effects: every one animates in its tile and on the card. */
export function NameEffectModal({ look, ...p }: PickerProps) {
  const options: Option[] = [{ value: "", label: "None", tile: <span className="max-w-full truncate text-base font-semibold">{look.name}</span> }, ...NAME_EFFECTS.map((e) => ({ value: e.id, label: e.name, key: `name:${e.id}` as StyleKey, tile: <span className="max-w-full truncate text-base font-semibold"><UserName name={look.name} effect={e.id} /></span> }))];
  return <PickModal title="Name effect" options={options} current={look.nameEffect} lookWith={(v) => ({ ...look, nameEffect: v })} {...p} />;
}

/** Picture frames. */
export function FrameModal({ look, ...p }: PickerProps) {
  const options: Option[] = [{ value: "", label: "None", tile: <Avatar name={look.name} src={look.avatarUrl} size={52} /> }, ...FRAMES.map((f) => ({ value: f.id, label: f.name, key: `frame:${f.id}` as StyleKey, tile: <Avatar name={look.name} src={look.avatarUrl} size={52} frame={f.id} /> }))];
  return <PickModal title="Picture frame" options={options} current={look.avatarFrame} lookWith={(v) => ({ ...look, avatarFrame: v })} cols="grid-cols-3 sm:grid-cols-4" {...p} />;
}

const encodeTheme = (t: { primary: string; accent: string } | null) => (t ? `${t.primary},${t.accent}` : "");
const decodeTheme = (v: string) => (v ? { primary: v.split(",")[0], accent: v.split(",")[1] } : null);

/** Profile themes: a few presets, or any two colours. */
export function ThemeModal({ look, ...p }: PickerProps) {
  const swatch = (t: { primary: string; accent: string }) => <span className="block h-10 w-16 rounded-control" style={{ background: `linear-gradient(165deg, ${t.primary}, ${t.accent})` }} />;
  const current = encodeTheme(look.theme);
  const presets: Option[] = THEME_PRESETS.map((t) => ({ value: encodeTheme(t), label: t.name, key: "theme:custom" as StyleKey, tile: swatch(t) }));
  const options: Option[] = [{ value: "", label: "None", tile: <span className="block h-10 w-16 rounded-control border border-line bg-surface" /> }, ...presets];
  // the colours they have now show as a tile too
  if (current && !presets.some((o) => o.value === current)) options.push({ value: current, label: "Yours", key: "theme:custom", tile: swatch(look.theme!) });
  return (
    <PickModal
      title="Profile theme"
      options={options}
      current={current}
      lookWith={(v) => ({ ...look, theme: decodeTheme(v) })}
      cols="grid-cols-3 sm:grid-cols-4"
      keyFor={(v) => (v ? "theme:custom" : undefined)}
      extra={(v, set) => {
        const t = decodeTheme(v) ?? { primary: "#2b1055", accent: "#d53369" };
        return (
          <div className="grid gap-4 rounded-card border border-line p-3 sm:grid-cols-2">
            <ColorPicker label="Top colour" value={t.primary} onChange={(primary) => set(encodeTheme({ ...t, primary }))} />
            <ColorPicker label="Bottom colour" value={t.accent} onChange={(accent) => set(encodeTheme({ ...t, accent }))} />
          </div>
        );
      }}
      {...p}
    />
  );
}

/**
 * Profile effects (uploaded by the Klique team): each small tile holds the effect still over your picture and plays it
 * while you point at it;
 * the card plays the one picked.
 */
export function EffectModal({ look, saved, accessOf, onSave, onUnlock, onTry, onClose }: PickerProps) {
  const { data, loading } = useEffectsCatalog();
  const list = data ?? [];
  const [pick, setPick] = useState(look.effect);
  const [hover, setHover] = useState<string | null>(null);
  const { busy, save } = useSave(onSave, onClose);
  const chosen = list.find((e) => e.id === pick) ?? null;
  const access = pick ? accessOf(`effect:${pick}`) : null;

  return (
    <Modal open onClose={onClose} title="Profile effect" size="xl">
      <div className="kq-live grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {!loading && list.length === 0 ? (
            <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line p-6 text-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-raised text-accent-text">
                <Icon name="asterisk" size={20} />
              </span>
              <p className="font-semibold">Profile effects are coming</p>
              <p className="max-w-xs text-sm text-ink-muted">Animations that play over your profile card. Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Profile effect">
              <button type="button" role="radio" aria-checked={!pick} onClick={() => setPick("")} className={cx("relative flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-control border px-2 py-3 text-center transition", !pick ? "border-accent bg-accent/10" : "border-line bg-raised/40 hover:bg-raised")}>
                <Avatar name={look.name} src={look.avatarUrl} size={52} />
                <span className="text-[11px] font-medium text-ink-muted">None</span>
              </button>
              {list.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={pick === e.id}
                  onClick={() => setPick(e.id)}
                  onMouseEnter={() => setHover(e.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(e.id)}
                  onBlur={() => setHover(null)}
                  className={cx("relative flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-control border px-2 py-3 text-center transition", pick === e.id ? "border-accent bg-accent/10" : "border-line bg-raised/40 hover:bg-raised")}
                >
                  <TileTag a={accessOf(`effect:${e.id}`)} />
                  {/* your picture under the effect, held on a frame; it plays while you point at it */}
                  <span className="relative flex size-[52px] items-center justify-center overflow-hidden rounded-control" style={themeStyle(look.theme)}>
                    <Avatar name={look.name} src={look.avatarUrl} size={34} />
                    <ProfileEffect spec={e} paused={hover !== e.id} />
                  </span>
                  <span className="max-w-full truncate text-[11px] font-medium text-ink-muted">{e.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="order-first flex flex-col items-center gap-2 md:order-none">
          <p className="eyebrow self-start md:self-center">Preview</p>
          <PreviewCard look={{ ...look, effect: pick }} effectSpec={chosen} />
        </div>
      </div>
      <Footer
        access={access}
        onCancel={onClose}
        onSave={() => void save(pick)}
        onUnlock={() => (onTry(pick), onUnlock(`effect:${pick}`))}
        onTry={() => (onTry(pick), onClose())}
        busy={busy}
        disabled={pick === saved}
      />
    </Modal>
  );
}

/** Animated (GIF) picture and banner: what it is, whether it's theirs, and Unlock. Nothing to pick: the GIFs go in Profile and Banner. */
export function AnimatedModal({ look, accessOf, onUnlock, onClose }: Pick<PickerProps, "look" | "accessOf" | "onUnlock" | "onClose">) {
  const a = accessOf("anim:profile");
  const using = isAnimatedPicture(look.avatarUrl) || isAnimatedPicture(look.bannerUrl);
  return (
    <Modal open onClose={onClose} title="Animated picture & banner" size="xl">
      <div className="kq-live grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3 text-sm">
          <p>Use a GIF as your profile picture or your banner, so it moves wherever people see you.</p>
          <ul className="space-y-1.5 text-ink-muted">
            <li>· Upload the GIF as your picture in Profile, or as your banner here in Profile style.</li>
            <li>· People who turn motion down or use data saver see its first frame.</li>
            <li>· When it ends, the GIF comes off and your plain picture and banner stay free.</li>
          </ul>
          <p className="font-semibold">{!a || a.price === 0 ? "It's free for you." : a.locked ? `Yours for 30 days for ${a.price.toLocaleString("en-NG")} Hype.` : using ? "It's yours, and you're using it." : "It's yours. Upload a GIF to use it."}</p>
        </div>
        <div className="order-first flex flex-col items-center gap-2 md:order-none">
          <p className="eyebrow self-start md:self-center">Preview</p>
          <PreviewCard look={look} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onClose}>Close</Button>
        {a?.locked && (
          <Button variant="primary" onClick={() => onUnlock("anim:profile")}>
            <Icon name="lock" size={14} /> Unlock · {a.price.toLocaleString("en-NG")} Hype
          </Button>
        )}
      </div>
    </Modal>
  );
}
