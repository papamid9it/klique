"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ImageField } from "@/components/ui/ImageField";
import { ProfileEffect, useEffectsCatalog } from "@/components/ui/ProfileEffect";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { themeStyle } from "@/components/ui/profileTheme";
import { BANNER_COLORS, getFrame, getNameEffect, isAnimatedPicture } from "@/lib/cosmetics";
import type { StyleKey } from "@/lib/wallet";
import { AnimatedModal, EffectModal, FrameModal, NameEffectModal, ThemeModal, type CardLook } from "./StyleModals";

/** What a design costs this person: free, theirs until a date, or locked at a price (see account/Points styleAccess). */
export type StyleAccess = (key: StyleKey) => { price: number; until: string | null; locked: boolean };

export interface StyleDraft {
  bannerUrl: string;
  bannerColor: string;
  avatarFrame: string;
  nameEffect: string;
  /** "#primary,#accent", or "" for none */
  profileTheme: string;
  profileEffect: string;
}

export const themeOf = (s: string) => (s ? { primary: s.split(",")[0], accent: s.split(",")[1] } : null);

/** The lock and price, or "Yours", beside a category. */
function Tag({ a }: { a: ReturnType<StyleAccess> | null }) {
  if (!a || a.price === 0) return null;
  if (a.locked)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-canvas">
        <Icon name="lock" size={10} /> {a.price}
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success" title={`Yours until ${new Date(a.until!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}>
      Yours
    </span>
  );
}

/** One category: what you have now, and a button that pops the picker out. */
function Row({ title, hint, preview, current, button, onOpen, tag }: { title: string; hint: string; preview: React.ReactNode; current: React.ReactNode; button: string; onOpen: () => void; tag?: React.ReactNode }) {
  return (
    <section>
      <p className="flex items-center gap-2 text-[13px] font-medium">
        {title} {tag}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3">
        <span className="flex w-20 shrink-0 justify-center">{preview}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current}</span>
        <Button size="sm" onClick={onOpen}>
          {button}
        </Button>
      </div>
    </section>
  );
}

type Picker = "name" | "frame" | "theme" | "effect" | "anim";

/**
 * Everything about how you look, Nitro style. The banner is set right here (a still one is free); every other
 * design is one row showing what you have, and its button pops out a picker with a live preview of your card
 * (picking a locked one asks you to unlock it with Hype first). Saving in a picker saves straight away.
 */
export function StylePicker({ value, onChange, name, handle, avatarUrl, access, onLocked, onSave }: { value: StyleDraft; onChange: (v: StyleDraft) => void; name: string; handle?: string; avatarUrl: string | null; access?: StyleAccess; onLocked?: (key: StyleKey) => void; onSave?: (patch: Partial<StyleDraft>) => Promise<void> }) {
  const set = (patch: Partial<StyleDraft>) => onChange({ ...value, ...patch });
  const a = (key: StyleKey) => (access ? access(key) : null);
  const [open, setOpen] = useState<Picker | null>(null);
  const theme = themeOf(value.profileTheme);
  const effects = useEffectsCatalog().data ?? [];
  const look: CardLook = { name, handle: handle ?? "", avatarUrl, avatarFrame: value.avatarFrame, nameEffect: value.nameEffect, theme, effect: value.profileEffect, bannerUrl: value.bannerUrl, bannerColor: value.bannerColor };
  const save = (patch: Partial<StyleDraft>) => async () => {
    set(patch);
    await onSave?.(patch);
  };
  const picker = { look, accessOf: (k: StyleKey) => a(k), onUnlock: (k: StyleKey) => onLocked?.(k), onClose: () => setOpen(null) };
  const none = <span className="font-normal text-ink-muted">None</span>;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-[13px] font-medium">Banner</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {BANNER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Banner colour ${c}`}
              aria-pressed={!value.bannerUrl && value.bannerColor === c}
              onClick={() => set({ bannerColor: c, bannerUrl: "" })}
              style={{ background: c }}
              className={cx("size-8 rounded-full border-2", !value.bannerUrl && value.bannerColor === c ? "border-ink" : "border-line")}
            />
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            Custom
            <input type="color" value={value.bannerColor || "#c8f560"} onChange={(e) => set({ bannerColor: e.target.value, bannerUrl: "" })} className="size-8 cursor-pointer rounded-full border border-line bg-transparent p-0" />
          </label>
          {(value.bannerColor || value.bannerUrl) && (
            <button type="button" onClick={() => set({ bannerColor: "", bannerUrl: "" })} className="text-xs text-ink-muted underline">
              Reset
            </button>
          )}
        </div>
        <div className="mt-3">
          <ImageField kind="photo" label="Or use a picture" value={value.bannerUrl} onChange={(u) => set({ bannerUrl: u })} reposition={{ aspect: 4 }} hint="Wide pictures work best. Drag it to choose what shows." />
        </div>
      </fieldset>

      <Row
        title="Name effect"
        hint="Your name moves wherever it shows."
        tag={value.nameEffect ? <Tag a={a(`name:${value.nameEffect}`)} /> : null}
        preview={<span className="max-w-full truncate text-[15px] font-semibold"><UserName name={name} effect={value.nameEffect} /></span>}
        current={getNameEffect(value.nameEffect)?.name ?? none}
        button="Change name effect"
        onOpen={() => setOpen("name")}
      />
      <Row
        title="Picture frame"
        hint="An animated ring around your picture."
        tag={value.avatarFrame ? <Tag a={a(`frame:${value.avatarFrame}`)} /> : null}
        preview={<Avatar name={name} src={avatarUrl} size={44} frame={value.avatarFrame || null} />}
        current={getFrame(value.avatarFrame)?.name ?? none}
        button="Change frame"
        onOpen={() => setOpen("frame")}
      />
      <Row
        title="Profile theme"
        hint="Two colours that tint your whole profile card."
        tag={<Tag a={a("theme:custom")} />}
        preview={<span className="block h-10 w-16 rounded-control border border-line" style={theme ? { background: `linear-gradient(165deg, ${theme.primary}, ${theme.accent})` } : undefined} />}
        current={theme ? `${theme.primary} → ${theme.accent}` : none}
        button="Change theme"
        onOpen={() => setOpen("theme")}
      />
      <Row
        title="Profile effect"
        hint="An animation that plays over your profile card."
        tag={value.profileEffect ? <Tag a={a(`effect:${value.profileEffect}`)} /> : null}
        preview={
          <span className="relative block h-12 w-16 overflow-hidden rounded-control bg-raised" style={themeStyle(theme)}>
            <ProfileEffect id={value.profileEffect} />
          </span>
        }
        current={effects.find((e) => e.id === value.profileEffect)?.name ?? none}
        button="Change effect"
        onOpen={() => setOpen("effect")}
      />
      <Row
        title="Animated picture & banner"
        hint="A GIF as your profile picture or banner."
        tag={<Tag a={a("anim:profile")} />}
        preview={<Icon name="image" size={22} className="text-accent-text" />}
        current={isAnimatedPicture(avatarUrl) || isAnimatedPicture(value.bannerUrl) ? "In use" : a("anim:profile") && !a("anim:profile")?.locked ? "Ready to use" : none}
        button="Learn more"
        onOpen={() => setOpen("anim")}
      />

      {open === "name" && <NameEffectModal {...picker} onSave={(v) => save({ nameEffect: v })()} />}
      {open === "frame" && <FrameModal {...picker} onSave={(v) => save({ avatarFrame: v })()} />}
      {open === "theme" && <ThemeModal {...picker} onSave={(v) => save({ profileTheme: v })()} />}
      {open === "effect" && <EffectModal {...picker} onSave={(v) => save({ profileEffect: v })()} />}
      {open === "anim" && <AnimatedModal {...picker} />}
    </div>
  );
}
