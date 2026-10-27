"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { ProfileModal } from "@/components/domain/profile/ProfileModal";
import { useToast } from "@/components/providers/ToastProvider";
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
import { AnimatedModal, EffectModal, FrameModal, NameEffectModal, PreviewCard, ThemeModal, type CardLook } from "./StyleModals";

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

/** The designs that can be tried on before paying, and what each is called and needs. */
type Tried = Partial<Pick<StyleDraft, "nameEffect" | "avatarFrame" | "profileTheme" | "profileEffect">>;
const TRY_FIELDS = ["nameEffect", "avatarFrame", "profileTheme", "profileEffect"] as const;
const keyOf = (f: (typeof TRY_FIELDS)[number], v: string): StyleKey | null => (!v ? null : f === "nameEffect" ? `name:${v}` : f === "avatarFrame" ? `frame:${v}` : f === "profileTheme" ? "theme:custom" : `effect:${v}`);
const KIND: Record<(typeof TRY_FIELDS)[number], string> = { nameEffect: "Name effect", avatarFrame: "Picture frame", profileTheme: "Profile theme", profileEffect: "Profile effect" };

/** What's being tried on, kept for this visit (it survives switching tabs, not closing the browser). */
const TRY_KEY = "klique:try-on";
function readTried(): Tried {
  try {
    return JSON.parse(sessionStorage.getItem(TRY_KEY) ?? "{}") as Tried;
  } catch {
    return {};
  }
}
function useTried(saved: StyleDraft) {
  const [tried, setTried] = useState<Tried>({});
  useEffect(() => setTried(readTried()), []);
  // what has been saved since stops being a try-on
  const live: Tried = {};
  for (const f of TRY_FIELDS) if (tried[f] !== undefined && tried[f] !== saved[f]) live[f] = tried[f];
  const set = (next: Tried) => {
    setTried(next);
    try {
      sessionStorage.setItem(TRY_KEY, JSON.stringify(next));
    } catch {
      /* private mode: it still works on this page */
    }
  };
  return { tried: live, set };
}

/**
 * Everything about how you look, Nitro style. The banner is set right here (a still one is free); every other
 * design is one row showing what you have, and its button pops out a picker with a live preview of your card
 * (picking a locked one asks you to unlock it with Hype first). Saving in a picker saves straight away.
 */
export function StylePicker({ value, onChange, name, handle, avatarUrl, access, onLocked, onSave, onUnlockAll, balance, onGetHype }: { value: StyleDraft; onChange: (v: StyleDraft) => void; name: string; handle?: string; avatarUrl: string | null; access?: StyleAccess; onLocked?: (key: StyleKey) => void; onSave?: (patch: Partial<StyleDraft>) => Promise<void>; onUnlockAll?: (keys: StyleKey[]) => Promise<void>; balance?: number; onGetHype?: () => void }) {
  const set = (patch: Partial<StyleDraft>) => onChange({ ...value, ...patch });
  const a = (key: StyleKey) => (access ? access(key) : null);
  const [open, setOpen] = useState<Picker | null>(null);
  const { tried, set: setTried } = useTried(value);
  const shown = { ...value, ...tried };
  const theme = themeOf(shown.profileTheme);
  const effects = useEffectsCatalog().data ?? [];
  const look: CardLook = { name, handle: handle ?? "", avatarUrl, avatarFrame: shown.avatarFrame, nameEffect: shown.nameEffect, theme, effect: shown.profileEffect, bannerUrl: value.bannerUrl, bannerColor: value.bannerColor };
  const save = (patch: Partial<StyleDraft>) => async () => {
    set(patch);
    await onSave?.(patch);
    // saved: no longer just tried on
    setTried(Object.fromEntries(Object.entries(tried).filter(([f]) => !(f in patch))));
  };
  const tryOn = (f: (typeof TRY_FIELDS)[number]) => (v: string) => setTried({ ...tried, [f]: v });
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

      {Object.keys(tried).length > 0 && <TryOnPanel look={look} saved={value} tried={tried} access={a} balance={balance} onReset={() => setTried({})} onUnlock={(k) => onLocked?.(k)} onUnlockAll={onUnlockAll} onGetHype={onGetHype} onSave={onSave} handle={handle} />}

      {open === "name" && <NameEffectModal {...picker} saved={value.nameEffect} onTry={tryOn("nameEffect")} onSave={(v) => save({ nameEffect: v })()} />}
      {open === "frame" && <FrameModal {...picker} saved={value.avatarFrame} onTry={tryOn("avatarFrame")} onSave={(v) => save({ avatarFrame: v })()} />}
      {open === "theme" && <ThemeModal {...picker} saved={value.profileTheme} onTry={tryOn("profileTheme")} onSave={(v) => save({ profileTheme: v })()} />}
      {open === "effect" && <EffectModal {...picker} saved={value.profileEffect} onTry={tryOn("profileEffect")} onSave={(v) => save({ profileEffect: v })()} />}
      {open === "anim" && <AnimatedModal {...picker} />}
    </div>
  );
}

/**
 * Everything being tried on, together: a big preview card ("only you can see this"), what each design is and whether
 * it's yours, and Unlock all for the locked ones (or one at a time). Nothing is saved or shown to anyone until it's
 * yours and saved. "Preview full profile" opens your whole profile with all of it on.
 */
function TryOnPanel({ look, saved, tried, access, balance, handle, onReset, onUnlock, onUnlockAll, onGetHype, onSave }: { look: CardLook; saved: StyleDraft; tried: Tried; access: (k: StyleKey) => ReturnType<StyleAccess> | null; balance?: number; handle?: string; onReset: () => void; onUnlock: (k: StyleKey) => void; onUnlockAll?: (keys: StyleKey[]) => Promise<void>; onGetHype?: () => void; onSave?: (patch: Partial<StyleDraft>) => Promise<void> }) {
  const toast = useToast();
  const effects = useEffectsCatalog().data ?? [];
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const items = TRY_FIELDS.filter((f) => tried[f] !== undefined).map((f) => {
    const v = tried[f]!;
    const key = keyOf(f, v);
    const theme = f === "profileTheme" ? themeOf(v) : null;
    const label = !v ? "None" : f === "nameEffect" ? getNameEffect(v)?.name : f === "avatarFrame" ? getFrame(v)?.name : f === "profileTheme" ? `${theme!.primary} → ${theme!.accent}` : effects.find((e) => e.id === v)?.name;
    return { f, v, key, label: label ?? v, a: key ? access(key) : null };
  });
  const locked = items.filter((i) => i.a?.locked);
  const total = locked.reduce((s, i) => s + (i.a?.price ?? 0), 0);
  const short = balance !== undefined ? Math.max(0, total - balance) : 0;

  async function keep() {
    setBusy(true);
    try {
      if (locked.length) await onUnlockAll?.(locked.map((i) => i.key!));
      await onSave?.(tried);
      onReset();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Trying on" className="rounded-card border border-accent/50 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold">Trying on</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          <Icon name="eye" size={12} /> Preview, only you can see this
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onReset} className="text-xs font-semibold text-ink-muted underline">
          Reset
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-5">
        <div className="flex justify-center">
          <PreviewCard look={look} />
        </div>
        <div className="flex flex-col gap-3">
          <ul className="divide-y divide-line rounded-control border border-line bg-surface">
            {items.map((i) => (
              <li key={i.f} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-ink-muted">{KIND[i.f]}</span>
                  <span className="block truncate text-sm font-semibold">{i.label}</span>
                </span>
                {i.a?.locked ? (
                  <Button size="sm" onClick={() => onUnlock(i.key!)}>
                    <Icon name="lock" size={12} /> {i.a.price.toLocaleString("en-NG")}
                  </Button>
                ) : (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">{i.a && i.a.price > 0 ? "Yours" : "Free"}</span>
                )}
              </li>
            ))}
          </ul>
          {locked.length > 0 && (
            <p className="text-[13px] text-ink-muted">
              {locked.length} locked · <span className="font-mono font-semibold text-ink">{total.toLocaleString("en-NG")}</span> Hype for {locked.length === 1 ? "it" : "all of them"}
              {short > 0 && <> · you need {short.toLocaleString("en-NG")} more</>}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {locked.length > 0 && short > 0 ? (
              <Button variant="primary" onClick={onGetHype}>
                <Icon name="coin" size={14} /> Get Hype
              </Button>
            ) : (
              <Button variant="primary" loading={busy} onClick={() => void keep()} disabled={locked.length > 0 && !onUnlockAll}>
                {locked.length ? (
                  <>
                    <Icon name="lock" size={14} /> Unlock all · {total.toLocaleString("en-NG")} Hype
                  </>
                ) : (
                  "Save all"
                )}
              </Button>
            )}
            {handle && (
              <Button onClick={() => setFull(true)}>
                <Icon name="user" size={14} /> Preview full profile
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-muted">Nothing is saved or shown to anyone until it&apos;s yours and saved. Your saved look stays {Object.values(saved).some(Boolean) ? "as it is" : "plain"} meanwhile.</p>
        </div>
      </div>
      {full && handle && (
        <ProfileModal
          handle={handle}
          onClose={() => setFull(false)}
          onOpenPerson={() => setFull(false)}
          tryOn={{ avatarFrame: look.avatarFrame || null, nameEffect: look.nameEffect || null, profileTheme: look.theme, profileEffect: look.effect || null }}
        />
      )}
    </section>
  );
}

