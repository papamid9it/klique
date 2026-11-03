import type { CSSProperties } from "react";
import { getNameEffect } from "@/lib/cosmetics";
import { PROFILE_DESIGNS_ENABLED } from "@/lib/constants";
import { cx } from "./cx";

/** A display name, drawn with the person's chosen effect (if any). Plain text otherwise. Animations stop with reduced motion or data saver (globals.css). */
export function UserName({ name, effect, className }: { name: string; effect?: string | null; className?: string }) {
  // name effects are a profile design: off for now (lib/constants PROFILE_DESIGNS_ENABLED)
  const spec = PROFILE_DESIGNS_ENABLED ? getNameEffect(effect) : null;
  if (!spec) return <span className={className}>{name}</span>;
  // the colours as variables, and (where the effect has them) deeper ones that light moods use (lib/moods.ts)
  const vars = (colors: string[], glow: string | undefined, p: string) => {
    const [c0, c1 = c0, c2 = c1] = colors;
    return {
      [`--${p}c0`]: c0,
      [`--${p}c1`]: c1,
      [`--${p}c2`]: c2,
      [`--${p}g`]: glow ?? c0,
      [`--${p}grad`]: `linear-gradient(90deg, ${colors.join(",")})`,
      // flame colours repeated so the climb loops without a seam
      [`--${p}rise`]: [...colors, ...colors.slice(1)].join(","),
    };
  };
  const style = { "--ms": `${spec.ms}ms`, ...vars(spec.colors, spec.glow, "d"), ...(spec.light ? vars(spec.light.colors, spec.light.glow, "l") : {}) } as CSSProperties;
  return (
    <span className={cx("kq-name", spec.mode, className)} style={style} data-text={name}>
      {name}
    </span>
  );
}
