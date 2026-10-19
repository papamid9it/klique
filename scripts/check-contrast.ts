/**
 * WCAG contrast check for every mood. Run: npm run check:contrast
 * Exits non-zero if any pair falls below its threshold.
 *
 *  - body text pairs  >= 4.5:1  (AA)
 *  - primary ink      >= 7:1    (AAA, it is the main reading colour)
 *  - UI boundaries    >= 3:1    (non-text contrast: accent fill vs canvas)
 */
import { MOODS } from "../lib/moods";

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

let failures = 0;
const rows: string[] = [];

for (const m of MOODS) {
  const t = m.tokens;
  const checks: [string, string, string, number][] = [
    ["ink on canvas", t.ink, t.canvas, 7],
    ["ink on surface", t.ink, t.surface, 7],
    ["ink on raised", t.ink, t.raised, 7],
    ["inkMuted on canvas", t.inkMuted, t.canvas, 4.5],
    ["inkMuted on surface", t.inkMuted, t.surface, 4.5],
    ["inkMuted on raised", t.inkMuted, t.raised, 4.5],
    ["accentInk on accent", t.accentInk, t.accent, 4.5],
    ["accent2Ink on accent2", t.accent2Ink, t.accent2, 4.5],
    ["accentText on canvas", t.accentText, t.canvas, 4.5],
    ["accentText on surface", t.accentText, t.surface, 4.5],
    ["accentText on raised", t.accentText, t.raised, 4.5],
    ["accent2Text on canvas", t.accent2Text, t.canvas, 4.5],
    ["accent2Text on surface", t.accent2Text, t.surface, 4.5],
    ["danger on canvas", t.danger, t.canvas, 4.5],
    ["danger on surface", t.danger, t.surface, 4.5],
    ["success on canvas", t.success, t.canvas, 4.5],
    ["success on surface", t.success, t.surface, 4.5],
    // Focus rings use accentText (see globals.css), so verify them on every surface.
    ["focus ring (accentText) vs canvas", t.accentText, t.canvas, 3],
    ["focus ring (accentText) vs surface", t.accentText, t.surface, 3],
    ["focus ring (accentText) vs raised", t.accentText, t.raised, 3],
    ["line vs canvas is visible", t.line, t.canvas, 1.15],
  ];
  for (const [label, fg, bg, min] of checks) {
    const ratio = contrast(fg, bg);
    if (ratio < min) {
      failures++;
      rows.push(`FAIL  ${m.id.padEnd(14)} ${label.padEnd(40)} ${ratio.toFixed(2)} < ${min}`);
    }
  }
}

if (failures) {
  console.log(rows.join("\n"));
  console.log(`\n${failures} contrast failure(s).`);
  process.exit(1);
} else {
  console.log(`All ${MOODS.length} moods pass contrast checks.`);
}
