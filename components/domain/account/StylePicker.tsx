"use client";

import { Avatar } from "@/components/ui/Avatar";
import { ImageField } from "@/components/ui/ImageField";
import { UserName } from "@/components/ui/UserName";
import { cx } from "@/components/ui/cx";
import { BANNER_COLORS, FRAMES, NAME_EFFECTS } from "@/lib/cosmetics";

export interface StyleDraft {
  bannerUrl: string;
  bannerColor: string;
  avatarFrame: string;
  nameEffect: string;
}

function Tile({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "flex flex-col items-center gap-1.5 rounded-control border px-2 py-3 text-center transition",
        on ? "border-accent bg-accent/10" : "border-line bg-surface hover:bg-raised",
      )}
    >
      {children}
      <span className="text-[11px] font-medium text-ink-muted">{label}</span>
    </button>
  );
}

/** Banner, avatar frame and name effect: every one is free. */
export function StylePicker({ value, onChange, name, avatarUrl }: { value: StyleDraft; onChange: (v: StyleDraft) => void; name: string; avatarUrl: string | null }) {
  const set = (patch: Partial<StyleDraft>) => onChange({ ...value, ...patch });
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
          <ImageField kind="photo" label="Or use a picture" value={value.bannerUrl} onChange={(u) => set({ bannerUrl: u })} hint="Wide pictures work best." />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[13px] font-medium">Picture frame</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <Tile on={!value.avatarFrame} onClick={() => set({ avatarFrame: "" })} label="None">
            <Avatar name={name} src={avatarUrl} size={52} />
          </Tile>
          {FRAMES.map((f) => (
            <Tile key={f.id} on={value.avatarFrame === f.id} onClick={() => set({ avatarFrame: f.id })} label={f.name}>
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
            <Tile key={e.id} on={value.nameEffect === e.id} onClick={() => set({ nameEffect: e.id })} label={e.name}>
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
