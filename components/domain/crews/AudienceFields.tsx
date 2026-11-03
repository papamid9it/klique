"use client";

import { TextField } from "@/components/ui/Field";
import { cx } from "@/components/ui/cx";
import type { CrewCardDTO } from "@/lib/types";

export type Audience = CrewCardDTO["audience"];
export interface AudienceValue {
  /** spots for other people (the host is on top): 1 to 99 */
  spots: string;
  audience: Audience;
  womenSpots: string;
  menSpots: string;
}

/** "1 spot", "Just you and one other", "8 spots" */
export const spotsLabel = (n: number) => (n === 1 ? "Just you and one other" : `${n} spots for others`);

/** Check the numbers; returns errors by field (empty when it's fine). */
export function checkAudience(v: AudienceValue): Record<string, string> {
  const e: Record<string, string> = {};
  const spots = Math.round(Number(v.spots));
  if (!Number.isFinite(spots) || spots < 1 || spots > 99) e.maxMembers = "1 to 99 spots for others.";
  if (v.audience === "mixed") {
    const w = Math.round(Number(v.womenSpots) || 0);
    const m = Math.round(Number(v.menSpots) || 0);
    if (w + m < 1) e.audience = "Set how many spots are for women and how many for men.";
    else if (w + m > spots) e.audience = `That's ${w + m} spots for women and men, but there are only ${spots}.`;
  }
  return e;
}

/** What the server takes: the total (host + spots) and the rule. */
export function audienceInput(v: AudienceValue) {
  const mixed = v.audience === "mixed";
  return { maxMembers: Math.round(Number(v.spots)) + 1, audience: v.audience, womenOnly: v.audience === "women", womenSpots: mixed ? Math.round(Number(v.womenSpots) || 0) : 0, menSpots: mixed ? Math.round(Number(v.menSpots) || 0) : 0 };
}

/**
 * How many people, and who can join: Everyone; Women only (offered when your profile says woman); Men only (when it
 * says man); or Mixed, with so many spots for women and for men and the rest open to anyone.
 */
export function AudienceFields({ value, onChange, canWomen, canMen, errors, minSpots = 1 }: { value: AudienceValue; onChange: (v: AudienceValue) => void; canWomen: boolean; canMen: boolean; errors: Record<string, string>; minSpots?: number }) {
  const set = (patch: Partial<AudienceValue>) => onChange({ ...value, ...patch });
  const spots = Math.round(Number(value.spots)) || 0;
  const choices: { id: Audience; label: string; hint: string; show: boolean }[] = [
    { id: "everyone", label: "Everyone", hint: "Anyone can join.", show: true },
    { id: "women", label: "Women only", hint: "Only people whose profile says woman.", show: canWomen || value.audience === "women" },
    { id: "men", label: "Men only", hint: "Only people whose profile says man.", show: canMen || value.audience === "men" },
    { id: "mixed", label: "Mixed, set numbers", hint: "So many spots for women and for men; any left over are open to anyone.", show: true },
  ];
  const w = Math.round(Number(value.womenSpots) || 0);
  const m = Math.round(Number(value.menSpots) || 0);
  return (
    <div className="space-y-4">
      <TextField
        label="Spots for others"
        type="number"
        inputMode="numeric"
        min={minSpots}
        max={99}
        value={value.spots}
        onChange={(e) => set({ spots: e.target.value })}
        error={errors.maxMembers}
        hint={spots >= 1 && spots <= 99 ? `${spotsLabel(spots)}. You're on top (${spots + 1} people in all).` : "1 to 99, not counting you."}
      />
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-medium">Who can join</legend>
        {choices
          .filter((c) => c.show)
          .map((c) => (
            <label key={c.id} className={cx("flex cursor-pointer items-start gap-3 rounded-control border bg-raised p-3 transition", value.audience === c.id ? "border-accent-text" : "border-line")}>
              <input type="radio" name="klique-audience" checked={value.audience === c.id} onChange={() => set({ audience: c.id })} className="mt-1 accent-[var(--accent-text)]" />
              <span>
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="block text-xs text-ink-muted">{c.hint}</span>
              </span>
            </label>
          ))}
        {value.audience === "mixed" && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <TextField label="Spots for women" type="number" inputMode="numeric" min={0} max={99} value={value.womenSpots} onChange={(e) => set({ womenSpots: e.target.value })} />
            <TextField label="Spots for men" type="number" inputMode="numeric" min={0} max={99} value={value.menSpots} onChange={(e) => set({ menSpots: e.target.value })} />
            <p className="col-span-2 text-xs text-ink-muted">{spots - w - m > 0 ? `${spots - w - m} ${spots - w - m === 1 ? "spot is" : "spots are"} open to anyone.` : "No spots left open to anyone."} People who haven&apos;t set a gender can only take those.</p>
          </div>
        )}
        {errors.audience && <p className="text-sm font-medium text-danger">{errors.audience}</p>}
      </fieldset>
    </div>
  );
}

/** The rule as a small tag on cards: "Women only", "Men only", "2 women · 1 man left". Null for Everyone. */
export function audienceTag(c: Pick<CrewCardDTO, "audience" | "left" | "closed">): string | null {
  if (c.audience === "women") return "Women only";
  if (c.audience === "men") return "Men only";
  if (c.audience !== "mixed" || c.closed) return null;
  const parts = [c.left.women ? `${c.left.women} ${c.left.women === 1 ? "woman" : "women"}` : "", c.left.men ? `${c.left.men} ${c.left.men === 1 ? "man" : "men"}` : "", c.left.any ? `${c.left.any} anyone` : ""].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} left` : "Mixed";
}
