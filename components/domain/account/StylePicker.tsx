"use client";

import { Avatar } from "@/components/ui/Avatar";
import { ImageField } from "@/components/ui/ImageField";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import { BANNER_COLORS, FRAMES, NAME_EFFECTS } from "@/lib/cosmetics";
import type { StyleKey } from "@/lib/points";

/** What a design costs this person: free, theirs until a date, or locked at a price (see Points.styleAccess). */
export type StyleAccess = (key: StyleKey) => { price: number; until: string | null; locked: boolean };

export interface StyleDraft {
  bannerUrl: string;
  bannerColor: string;
  avatarFrame: string;
  nameEffect: string;
}

function Tag({ a }: { a: ReturnType<StyleAccess> | null }) {
  if (!a || a.price === 0) return null;
  if (a.locked)
    return (
      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-canvas">
        <Icon name="lock" size={10} /> {a.price}
      </span>
    );
  return (
    <span className="absolute top-1.5 right-1.5 inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success" title={`Yours until ${new Date(a.until!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}>
      Yours
    </span>
  );
}

function Tile({ on, onClick, label, children, access }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode; access?: ReturnType<StyleAccess> | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "relative flex flex-col items-center gap-1.5 rounded-control border px-2 py-3 text-center transition",
        on ? "border-accent bg-accent/10" : "border-line bg-surface hover:bg-raised",
      )}
    >
      <Tag a={access ?? null} />
      <span className={cx("flex max-w-full flex-col items-center", access?.locked && "opacity-70")}>{children}</span>
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
    </button>
  );
}

/**
 * Banner (always free), picture frame and name style. With `access`, paid designs show a lock and price, and
 * picking a locked one calls `onLocked` (to unlock it) instead of selecting it.
 */
export function StylePicker({ value, onChange, name, avatarUrl, access, onLocked, worn }: { value: StyleDraft; onChange: (v: StyleDraft) => void; name: string; avatarUrl: string | null; access?: StyleAccess; onLocked?: (key: StyleKey) => void; worn?: { avatarFrame: string; nameEffect: string } }) {
  const set = (patch: Partial<StyleDraft>) => onChange({ ...value, ...patch });
  const a = (key: StyleKey) => (access ? access(key) : null);
  /** pick it, or ask to unlock it first (what you already wear stays pickable) */
  const pick = (key: StyleKey, patch: Partial<StyleDraft>, current: string) => {
    const x = a(key);
    if (x?.locked && current !== key.split(":")[1] && onLocked) onLocked(key);
    else set(patch);
  };
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

      <fieldset>
        <legend className="text-[13px] font-medium">Picture frame</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <Tile on={!value.avatarFrame} onClick={() => set({ avatarFrame: "" })} label="None">
            <Avatar name={name} src={avatarUrl} size={52} />
          </Tile>
          {FRAMES.map((f) => (
            <Tile key={f.id} on={value.avatarFrame === f.id} onClick={() => pick(`frame:${f.id}`, { avatarFrame: f.id }, worn?.avatarFrame ?? "")} label={f.name} access={a(`frame:${f.id}`)}>
              <Avatar name={name} src={avatarUrl} size={52} frame={f.id} />
            </Tile>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-medium">Name style</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile on={!value.nameEffect} onClick={() => set({ nameEffect: "" })} label="None">
            <span className="max-w-full truncate text-base font-semibold">{name}</span>
          </Tile>
          {NAME_EFFECTS.map((e) => (
            <Tile key={e.id} on={value.nameEffect === e.id} onClick={() => pick(`name:${e.id}`, { nameEffect: e.id }, worn?.nameEffect ?? "")} label={e.name} access={a(`name:${e.id}`)}>
              <span className="max-w-full truncate text-base font-semibold">
                <UserName name={name} effect={e.id} />
              </span>
            </Tile>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
