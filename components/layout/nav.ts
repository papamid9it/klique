import type { IconName } from "@/components/ui/Icon";

export const NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Discover", icon: "home", match: (p) => p === "/" || p.startsWith("/search") },
  { href: "/events", label: "Events", icon: "calendar", match: (p) => p.startsWith("/events") },
  { href: "/communities", label: "Communities", icon: "users", match: (p) => p.startsWith("/communities") || p.startsWith("/invite") },
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") },
];

/** Token-backed dot colours so "Your scenes" re-tints with every mood. */
export const SCENE_DOT: Record<string, string> = {
  skate: "var(--accent)",
  music: "var(--accent2)",
  streetwear: "var(--danger)",
  photography: "var(--success)",
  running: "var(--accent-text)",
  art: "var(--accent2-text)",
  film: "var(--ink-muted)",
  dance: "var(--accent)",
};
