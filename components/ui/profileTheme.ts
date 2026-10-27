import type { CSSProperties } from "react";

/**
 * A profile theme (two colours) as the card's background, like Nitro: a gradient from one to the other, with the
 * card's own surface laid over it at 70% so text keeps its contrast whatever colours they picked.
 */
export function themeStyle(theme?: { primary: string; accent: string } | null): CSSProperties | undefined {
  if (!theme) return undefined;
  return { backgroundImage: `linear-gradient(color-mix(in oklab, var(--surface) 70%, transparent), color-mix(in oklab, var(--surface) 70%, transparent)), linear-gradient(165deg, ${theme.primary}, ${theme.accent})` };
}
