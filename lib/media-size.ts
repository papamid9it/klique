/**
 * A chat picture's size, kept on its link (`…photo.webp#s=1200x800`) when it's sent, so every chat can hold exactly
 * its space before it loads (like Discord): nothing moves when it arrives. The part after `#` never reaches the
 * server or storage (file clean-up ignores it). Pictures sent before this have no size: they get a fixed frame.
 */

/** The link with its size added (a size we don't know leaves it as it is). */
export function withSize(url: string, width?: number | null, height?: number | null): string {
  if (!width || !height || width < 1 || height < 1) return url;
  const [base, frag] = url.split("#");
  const rest = (frag ?? "").split("&").filter((p) => p && !p.startsWith("s="));
  return `${base}#${[...rest, `s=${Math.round(width)}x${Math.round(height)}`].join("&")}`;
}

/** Its size, if the link carries one. */
export function sizeOf(url: string): { width: number; height: number } | null {
  const m = /[#&]s=(\d{1,5})x(\d{1,5})(?:&|$)/.exec(url);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The address itself, without what's after `#`. */
export const plainUrl = (url: string) => url.split("#")[0];

/** Width over height a single chat picture may take: taller or wider ones are shown whole inside that frame. */
export const CHAT_TALLEST = 1 / 2;
export const CHAT_WIDEST = 2.4;
export const chatAspect = (url: string) => {
  const s = sizeOf(url);
  return s ? Math.min(CHAT_WIDEST, Math.max(CHAT_TALLEST, s.width / s.height)) : null;
};

/** Pictures in one chat message (like Discord: up to 10). */
export const CHAT_IMAGES_MAX = 10;

/**
 * How several pictures sit, like Discord's mosaic: how many go in each row, top to bottom. A row of one is wide (2:1),
 * the rest are squares. Three is its own shape (one big on the left, two stacked on the right), shown as [3] here.
 */
export function chatRows(n: number): number[] {
  switch (n) {
    case 2: return [2];
    case 3: return [3];
    case 4: return [2, 2];
    case 5: return [2, 3];
    case 6: return [3, 3];
    case 7: return [1, 3, 3];
    case 8: return [2, 3, 3];
    case 9: return [3, 3, 3];
    case 10: return [1, 3, 3, 3];
    default: return n > 0 ? [n] : [];
  }
}
