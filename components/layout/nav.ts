import type { IconName } from "@/components/ui/Icon";

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

/** The main nav in the left panel on Home and the other top-level pages. Discover is the home page; finding
 * communities is a tab on the Communities page. */
export const HOME_NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean; authed?: boolean }[] = [
  { href: "/", label: "Discover", icon: "home", match: (p) => p === "/" || p.startsWith("/search") },
  { href: "/events", label: "Events", icon: "calendar", match: (p) => p.startsWith("/events") },
  { href: "/messages", label: "Messages", icon: "message", match: (p) => p.startsWith("/messages"), authed: true },
  { href: "/notifications", label: "Notifications", icon: "bell", match: (p) => p.startsWith("/notifications"), authed: true },
  { href: "/communities", label: "Communities", icon: "users", match: (p) => p === "/communities" },
];

