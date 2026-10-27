/**
 * Profile cosmetics, shared by web and mobile: 20 avatar frames (animated rings
 * around the picture) and 20 name effects. Both are plain data. Each platform
 * draws the same spec its own way (CSS on the web, Animated views on mobile),
 * so a frame looks like the same frame everywhere.
 */

export type FrameId =
  | "fire" | "freeze" | "glitch" | "neon-pink" | "neon-cyan" | "rainbow" | "aurora" | "gold" | "electric" | "toxic"
  | "sunset" | "ocean" | "blossom" | "galaxy" | "lava" | "matrix" | "royal" | "vapor" | "heartbeat" | "halo";

export interface FrameSpec {
  id: FrameId;
  name: string;
  /** ring colours; the sweep goes through them in order */
  colors: string[];
  /** ring thickness in px at a 40px avatar (scales with size) */
  ring: number;
  /** ms for one full turn of the ring (0 = still) */
  spin: number;
  /** soft glow behind the ring, pulsing */
  glow?: { color: string; pulse: number };
  /** quick random-looking flicker of the whole ring (fire, electric) */
  flicker?: boolean;
  /** ring splits into two jittering colour layers */
  glitch?: boolean;
  /** little dots circling the avatar */
  orbit?: { count: number; color: string; ms: number };
}

export const FRAMES: FrameSpec[] = [
  { id: "fire", name: "Fire", colors: ["#ff3d00", "#ff9100", "#ffd600", "#ff9100", "#ff3d00"], ring: 3, spin: 2200, glow: { color: "#ff6a00", pulse: 900 }, flicker: true },
  { id: "freeze", name: "Freeze", colors: ["#e3f6ff", "#7dd3fc", "#38bdf8", "#7dd3fc", "#e3f6ff"], ring: 3, spin: 6000, glow: { color: "#7dd3fc", pulse: 2400 }, orbit: { count: 4, color: "#ffffff", ms: 7000 } },
  { id: "glitch", name: "Glitch", colors: ["#00fff0", "#00fff0"], ring: 2, spin: 0, glitch: true },
  { id: "neon-pink", name: "Neon Pink", colors: ["#ff2bd6", "#ff2bd6"], ring: 3, spin: 0, glow: { color: "#ff2bd6", pulse: 1600 } },
  { id: "neon-cyan", name: "Neon Cyan", colors: ["#22f2ff", "#22f2ff"], ring: 3, spin: 0, glow: { color: "#22f2ff", pulse: 1600 } },
  { id: "rainbow", name: "Rainbow", colors: ["#ff3b3b", "#ffb300", "#f6ff3b", "#3bff6a", "#3bb5ff", "#a23bff", "#ff3b3b"], ring: 3, spin: 3000 },
  { id: "aurora", name: "Aurora", colors: ["#34d399", "#22d3ee", "#a78bfa", "#34d399"], ring: 3, spin: 5000, glow: { color: "#34d399", pulse: 3000 } },
  { id: "gold", name: "Gold", colors: ["#fff1b0", "#f5c542", "#b8860b", "#f5c542", "#fff1b0"], ring: 3, spin: 4000 },
  { id: "electric", name: "Electric", colors: ["#fffbe0", "#ffe600", "#ffffff", "#ffe600"], ring: 2, spin: 900, flicker: true, glow: { color: "#ffe600", pulse: 500 } },
  { id: "toxic", name: "Toxic", colors: ["#a3ff12", "#3d8b00", "#a3ff12"], ring: 3, spin: 3500, glow: { color: "#a3ff12", pulse: 1200 }, orbit: { count: 3, color: "#caff6b", ms: 4500 } },
  { id: "sunset", name: "Sunset", colors: ["#ff7e5f", "#feb47b", "#ff5ea8", "#8a5bff", "#ff7e5f"], ring: 3, spin: 4500 },
  { id: "ocean", name: "Ocean", colors: ["#0ea5e9", "#1e3a8a", "#22d3ee", "#0ea5e9"], ring: 3, spin: 7000, glow: { color: "#0ea5e9", pulse: 3200 } },
  { id: "blossom", name: "Blossom", colors: ["#ffc2d9", "#ff8fb8", "#ffc2d9"], ring: 2, spin: 0, glow: { color: "#ff8fb8", pulse: 2600 }, orbit: { count: 5, color: "#ffd1e3", ms: 8000 } },
  { id: "galaxy", name: "Galaxy", colors: ["#312e81", "#7c3aed", "#38bdf8", "#7c3aed", "#312e81"], ring: 3, spin: 6500, orbit: { count: 6, color: "#ffffff", ms: 9000 } },
  { id: "lava", name: "Lava", colors: ["#7f1d1d", "#ef4444", "#fb923c", "#ef4444", "#7f1d1d"], ring: 3, spin: 3200, flicker: true, glow: { color: "#ef4444", pulse: 1400 } },
  { id: "matrix", name: "Matrix", colors: ["#00ff66", "#00ff66"], ring: 2, spin: 0, glitch: true, orbit: { count: 3, color: "#00ff66", ms: 3000 } },
  { id: "royal", name: "Royal", colors: ["#7c3aed", "#f5c542", "#7c3aed"], ring: 3, spin: 5000, glow: { color: "#a78bfa", pulse: 2000 } },
  { id: "vapor", name: "Vapor", colors: ["#ff71ce", "#01cdfe", "#b967ff", "#ff71ce"], ring: 3, spin: 3800 },
  { id: "heartbeat", name: "Heartbeat", colors: ["#ff3b5c", "#ff3b5c"], ring: 3, spin: 0, glow: { color: "#ff3b5c", pulse: 800 } },
  { id: "halo", name: "Halo", colors: ["#ffffff", "#fff1b0", "#ffffff"], ring: 2, spin: 0, glow: { color: "#fff1b0", pulse: 2800 } },
];

export type NameEffectId =
  | "gold-shimmer" | "rainbow-flow" | "fire" | "ice" | "glitch" | "neon-pink" | "neon-cyan" | "aurora" | "sunset" | "ocean"
  | "toxic" | "galaxy" | "lava" | "matrix" | "royal" | "vapor" | "electric" | "blossom" | "chrome" | "heartbeat";

export type NameMode =
  /** colours slide along the letters */
  | "flow"
  /** a bright band sweeps across a steady base colour */
  | "shimmer"
  /** two colours breathe back and forth through the letters */
  | "pulse"
  /** a bright spark jumps across the letters, which stutter like a failing neon tube */
  | "flicker"
  /** flame colours climb up through the letters, flickering as they go */
  | "rise"
  /** a double thump, like a heartbeat, with the colour flushing on each beat */
  | "beat"
  /** colour split into two jittering layers */
  | "glitch";

export interface NameEffectSpec {
  id: NameEffectId;
  name: string;
  mode: NameMode;
  colors: string[];
  /** accent colour the animation flashes to (the web draws it inside the letters, never as a glow) */
  glow?: string;
  /** ms for one cycle */
  ms: number;
}

export const NAME_EFFECTS: NameEffectSpec[] = [
  { id: "gold-shimmer", name: "Gold Shimmer", mode: "shimmer", colors: ["#d4a017", "#fff4b8"], glow: "#f5c542", ms: 2600 },
  { id: "rainbow-flow", name: "Rainbow Flow", mode: "flow", colors: ["#ff4d4d", "#ffb347", "#f6ff4d", "#4dff88", "#4dbbff", "#b04dff", "#ff4d4d"], ms: 3200 },
  { id: "fire", name: "Fire", mode: "rise", colors: ["#ff3d00", "#ffb300", "#ffe066", "#ff7a00", "#ff3d00"], glow: "#ff6a00", ms: 1600 },
  { id: "ice", name: "Ice", mode: "shimmer", colors: ["#7dd3fc", "#ffffff"], glow: "#38bdf8", ms: 3400 },
  { id: "glitch", name: "Glitch", mode: "glitch", colors: ["#ffffff", "#00fff0", "#ff2bd6"], ms: 1800 },
  { id: "neon-pink", name: "Neon Pink", mode: "flicker", colors: ["#ff7ae9"], glow: "#ff2bd6", ms: 2600 },
  { id: "neon-cyan", name: "Neon Cyan", mode: "flicker", colors: ["#8ffbff"], glow: "#22f2ff", ms: 3000 },
  { id: "aurora", name: "Aurora", mode: "flow", colors: ["#34d399", "#22d3ee", "#a78bfa", "#34d399"], ms: 4200 },
  { id: "sunset", name: "Sunset", mode: "flow", colors: ["#ff7e5f", "#feb47b", "#ff5ea8", "#a06bff", "#ff7e5f"], ms: 4000 },
  { id: "ocean", name: "Ocean", mode: "flow", colors: ["#38bdf8", "#2563eb", "#22d3ee", "#38bdf8"], ms: 5000 },
  { id: "toxic", name: "Toxic", mode: "pulse", colors: ["#b6ff2e"], glow: "#a3ff12", ms: 1400 },
  { id: "galaxy", name: "Galaxy", mode: "flow", colors: ["#a78bfa", "#60a5fa", "#f0abfc", "#a78bfa"], glow: "#7c3aed", ms: 5200 },
  { id: "lava", name: "Lava", mode: "rise", colors: ["#7f1d1d", "#ef4444", "#fb923c", "#ffd08a", "#ef4444"], glow: "#ef4444", ms: 1700 },
  { id: "matrix", name: "Matrix", mode: "glitch", colors: ["#00ff66", "#00ff66", "#007a33"], ms: 2200 },
  { id: "royal", name: "Royal", mode: "flow", colors: ["#a78bfa", "#f5c542", "#a78bfa"], ms: 3600 },
  { id: "vapor", name: "Vapor", mode: "flow", colors: ["#ff71ce", "#01cdfe", "#b967ff", "#ff71ce"], ms: 3400 },
  { id: "electric", name: "Electric", mode: "flicker", colors: ["#fff36b"], glow: "#ffe600", ms: 900 },
  { id: "blossom", name: "Blossom", mode: "pulse", colors: ["#ffb3d1"], glow: "#ff8fb8", ms: 2800 },
  { id: "chrome", name: "Chrome", mode: "shimmer", colors: ["#9aa4b2", "#ffffff"], ms: 2800 },
  { id: "heartbeat", name: "Heartbeat", mode: "beat", colors: ["#ff5c7a"], glow: "#ff3b5c", ms: 900 },
];

export const FRAME_IDS = FRAMES.map((f) => f.id) as FrameId[];
export const NAME_EFFECT_IDS = NAME_EFFECTS.map((f) => f.id) as NameEffectId[];

export const getFrame = (id?: string | null) => FRAMES.find((f) => f.id === id) ?? null;
export const getNameEffect = (id?: string | null) => NAME_EFFECTS.find((f) => f.id === id) ?? null;

/** Quick banner colours (people can also upload a picture). */
export const BANNER_COLORS = ["#c8f560", "#a79bff", "#ff6b4a", "#38bdf8", "#ff71ce", "#f5c542", "#34d399", "#7c3aed", "#ef4444", "#64748b", "#ffffff", "#111111"];

/* ---------------- profile themes and effects ---------------- */

/** Quick colours for themes (people can pick any colour too). */
export const STYLE_COLORS = ["#ffffff", "#ff4d6d", "#ff9f1c", "#ffd60a", "#3bff8f", "#22d3ee", "#4d7cff", "#a855f7", "#ff2bd6", "#c8f560", "#111111"];


/** Two colours that tint the whole profile card, like Nitro themes. */
export interface ProfileTheme {
  primary: string;
  accent: string;
}
export const THEME_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Dusk", primary: "#2b1055", accent: "#d53369" },
  { name: "Lagoon", primary: "#0f2027", accent: "#2c7a8c" },
  { name: "Ember", primary: "#3a0d0d", accent: "#ff7a18" },
  { name: "Mint", primary: "#0b3d2e", accent: "#5ee7b0" },
  { name: "Candy", primary: "#ff8fb8", accent: "#7f5af0" },
  { name: "Gold", primary: "#2d2205", accent: "#e8b923" },
];

/* Profile effects are uploaded by site admins (models/ProfileEffect): see components/ui/ProfileEffect. */

/** An uploaded picture that moves (avatars and banners need "Animated avatar & banner" for these). */
export const isAnimatedPicture = (url?: string | null) => !!url && /\.gif($|[?#])/i.test(url.split("#")[0]);
