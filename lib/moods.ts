/**
 * The 10 "moods" — one coherent design system, expressed as tokens.
 *
 * Every mood defines the SAME set of tokens. Components only ever use the
 * token-backed Tailwind utilities (bg-canvas, text-ink, border-line, bg-accent…)
 * so a mood can never break a layout, only recolour it.
 *
 * `scripts/check-contrast.ts` verifies the WCAG contrast of every pair below.
 */

export type MoodId =
  | "after-hours"
  | "lagos-heat"
  | "alte-archive"
  | "concrete"
  | "palm-wine"
  | "indigo-night"
  | "soft-focus"
  | "street-poster"
  | "coastline"
  | "monochrome"
  | "paper-mono";

export interface MoodTokens {
  /** page background */
  canvas: string;
  /** cards, panels */
  surface: string;
  /** hovered / nested / input surfaces */
  raised: string;
  /** primary text */
  ink: string;
  /** secondary text */
  inkMuted: string;
  /** hairline borders */
  line: string;
  /** primary accent fill (buttons, highlights) */
  accent: string;
  /** text/icon colour that sits ON the accent fill */
  accentInk: string;
  /** accent when used AS text/icon on canvas or surface */
  accentText: string;
  /** secondary accent fill */
  accent2: string;
  /** text that sits ON the secondary accent fill */
  accent2Ink: string;
  /** secondary accent used AS text on canvas or surface */
  accent2Text: string;
  /** destructive text/icon on canvas or surface */
  danger: string;
  /** positive text/icon on canvas or surface */
  success: string;
}

export interface Mood {
  id: MoodId;
  name: string;
  description: string;
  scheme: "dark" | "light";
  tokens: MoodTokens;
}

export const DEFAULT_MOOD: MoodId = "monochrome";

export const MOODS: Mood[] = [
  {
    id: "after-hours",
    name: "After Hours",
    description: "Charcoal after dark, with an electric lime pulse.",
    scheme: "dark",
    tokens: {
      canvas: "#121310",
      surface: "#1a1c17",
      raised: "#242720",
      ink: "#f2f4ea",
      inkMuted: "#a6ab9b",
      line: "#33372c",
      accent: "#c8f560",
      accentInk: "#12150a",
      accentText: "#c8f560",
      accent2: "#a79bff",
      accent2Ink: "#14102e",
      accent2Text: "#b8aeff",
      danger: "#ff7a72",
      success: "#7be0a3",
    },
  },
  {
    id: "lagos-heat",
    name: "Lagos Heat",
    description: "Warm orange over deep brown, with a vivid coral spark.",
    scheme: "dark",
    tokens: {
      canvas: "#1c110c",
      surface: "#27170f",
      raised: "#352015",
      ink: "#fbeee3",
      inkMuted: "#cfae98",
      line: "#4d3022",
      accent: "#ff8a2b",
      accentInk: "#1c0e05",
      accentText: "#ff9a47",
      accent2: "#ff5d5d",
      accent2Ink: "#1f0808",
      accent2Text: "#ff8585",
      danger: "#ff8a80",
      success: "#8fdc9f",
    },
  },
  {
    id: "alte-archive",
    name: "Alté Archive",
    description: "Muted plum, dusty rose and soft cream. Thrifted-vinyl energy.",
    scheme: "dark",
    tokens: {
      canvas: "#1f1620",
      surface: "#2a1e2b",
      raised: "#382838",
      ink: "#f6ebdd",
      inkMuted: "#cdb3ba",
      line: "#4d3a4c",
      accent: "#e3a1b0",
      accentInk: "#2a1420",
      accentText: "#eaaebb",
      accent2: "#f3e3c8",
      accent2Ink: "#2a1e2b",
      accent2Text: "#f3e3c8",
      danger: "#ff8f8f",
      success: "#9fddb0",
    },
  },
  {
    id: "concrete",
    name: "Concrete",
    description: "Cool greys and graphite, cut through with acid yellow.",
    scheme: "dark",
    tokens: {
      canvas: "#16181b",
      surface: "#1f2226",
      raised: "#2a2e33",
      ink: "#eceff3",
      inkMuted: "#a2a9b2",
      line: "#383d44",
      accent: "#eaff3d",
      accentInk: "#14160a",
      accentText: "#eaff3d",
      accent2: "#93a7bd",
      accent2Ink: "#101418",
      accent2Text: "#a9bbce",
      danger: "#ff8a85",
      success: "#86e0a8",
    },
  },
  {
    id: "palm-wine",
    name: "Palm Wine",
    description: "Deep green, warm tan and pale gold. Slow afternoons.",
    scheme: "dark",
    tokens: {
      canvas: "#0f1c15",
      surface: "#16271d",
      raised: "#203629",
      ink: "#f1eadb",
      inkMuted: "#b4c0aa",
      line: "#30493a",
      accent: "#e8cf7a",
      accentInk: "#1a1405",
      accentText: "#e8cf7a",
      accent2: "#c99a6b",
      accent2Ink: "#1b1208",
      accent2Text: "#dcb184",
      danger: "#ff9086",
      success: "#8fe0a2",
    },
  },
  {
    id: "indigo-night",
    name: "Indigo Night",
    description: "Midnight blue with violet depth and icy blue highlights.",
    scheme: "dark",
    tokens: {
      canvas: "#0b1030",
      surface: "#121945",
      raised: "#1c2559",
      ink: "#e8ecff",
      inkMuted: "#a8b2e2",
      line: "#2b367c",
      accent: "#9b8cff",
      accentInk: "#0b0a2a",
      accentText: "#b0a4ff",
      accent2: "#9fd8ff",
      accent2Ink: "#07162b",
      accent2Text: "#9fd8ff",
      danger: "#ff8d9a",
      success: "#7fe3b4",
    },
  },
  {
    id: "soft-focus",
    name: "Soft Focus",
    description: "Light cream, dusty lavender and a gentle pink. Daylight mood.",
    scheme: "light",
    tokens: {
      canvas: "#faf4ea",
      surface: "#fffdf8",
      raised: "#f1e8da",
      ink: "#2b2530",
      inkMuted: "#665c6e",
      line: "#e1d4c1",
      accent: "#b9a5de",
      accentInk: "#241c33",
      accentText: "#6a549f",
      accent2: "#f2b5c8",
      accent2Ink: "#3a1f2b",
      accent2Text: "#a03a66",
      danger: "#b3261e",
      success: "#26734d",
    },
  },
  {
    id: "street-poster",
    name: "Street Poster",
    description: "Off-white paper, ink black and one loud red. Wheat-paste style.",
    scheme: "light",
    tokens: {
      canvas: "#f4f1ea",
      surface: "#ffffff",
      raised: "#ebe6da",
      ink: "#111111",
      inkMuted: "#59554d",
      line: "#d6d0c2",
      accent: "#d71f14",
      accentInk: "#ffffff",
      accentText: "#c91a10",
      accent2: "#111111",
      accent2Ink: "#f4f1ea",
      accent2Text: "#111111",
      danger: "#b3261e",
      success: "#1f7a4a",
    },
  },
  {
    id: "coastline",
    name: "Coastline",
    description: "Deep ocean blue, seafoam and sand. Sunday at Elegushi.",
    scheme: "dark",
    tokens: {
      canvas: "#08202e",
      surface: "#0e2e41",
      raised: "#163f57",
      ink: "#eef7f3",
      inkMuted: "#9fc2ca",
      line: "#215069",
      accent: "#5fe3c0",
      accentInk: "#04231c",
      accentText: "#5fe3c0",
      accent2: "#e8d3a8",
      accent2Ink: "#2a2010",
      accent2Text: "#e8d3a8",
      danger: "#ff8f86",
      success: "#7fe3a8",
    },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    description: "Black, white and greys. Nothing but the content. The default.",
    scheme: "dark",
    tokens: {
      canvas: "#0a0a0a",
      surface: "#141414",
      raised: "#1f1f1f",
      ink: "#f5f5f5",
      inkMuted: "#a3a3a3",
      line: "#333333",
      accent: "#ffffff",
      accentInk: "#0a0a0a",
      accentText: "#ffffff",
      accent2: "#8a8a8a",
      accent2Ink: "#0a0a0a",
      accent2Text: "#b5b5b5",
      danger: "#ff8f8f",
      success: "#8fe0a8",
    },
  },
  {
    id: "paper-mono",
    name: "Paper Mono",
    description: "Monochrome in daylight: white paper, black ink, greys between.",
    scheme: "light",
    tokens: {
      canvas: "#f6f6f6",
      surface: "#ffffff",
      raised: "#ececec",
      ink: "#0a0a0a",
      inkMuted: "#525252",
      line: "#d4d4d4",
      accent: "#0a0a0a",
      accentInk: "#ffffff",
      accentText: "#0a0a0a",
      accent2: "#737373",
      accent2Ink: "#ffffff",
      accent2Text: "#525252",
      danger: "#b91c1c",
      success: "#15803d",
    },
  },
];

export const MOOD_IDS = MOODS.map((m) => m.id) as MoodId[];

export function getMood(id: string | null | undefined): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[0];
}

export function isMoodId(id: unknown): id is MoodId {
  return typeof id === "string" && (MOOD_IDS as string[]).includes(id);
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

/** CSS custom properties for one mood. */
export function moodToCss(mood: Mood): string {
  return Object.entries(mood.tokens)
    .map(([k, v]) => `--${kebab(k)}:${v};`)
    .join("");
}

/** Full stylesheet: one `[data-theme="id"]` block per mood. */
export function allMoodsCss(): string {
  const light = MOODS.filter((m) => m.scheme === "light").map((m) => `[data-theme="${m.id}"]`);
  const names = ["c0", "c1", "c2", "g", "grad", "rise"];
  return [
    ...MOODS.map((m) => `[data-theme="${m.id}"]{color-scheme:${m.scheme};${moodToCss(m)}}`),
    // name effects (components/ui/UserName): their own colours, and on light moods their deeper set where they have one
    `.kq-name{${names.map((n) => `--${n}:var(--d${n});`).join("")}}`,
    `:is(${light.join(",")}) .kq-name{${names.map((n) => `--${n}:var(--l${n},var(--d${n}));`).join("")}}`,
  ].join("\n");
}
