"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProfileCard } from "@/components/providers/ProfileCardProvider";
import { Dropdown, type MenuEntry } from "@/components/ui/Dropdown";
import { useSetStatus } from "@/components/domain/profile/StatusPicker";
import { askSignOut } from "@/components/domain/account/SignOutDialog";
import { StatusIcon } from "@/components/domain/profile/ProfileParts";
import { PRESENCES } from "@/lib/constants";
import { useInDesktopApp } from "@/lib/hooks/useInDesktopApp";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

/**
 * Your account menu: your status, profile, ads, settings, admin, sign out. One menu used from the sidebar's profile card,
 * the slim rail's picture, and your own profile page on phones. Notifications aren't here: the sidebar and the
 * phone top bar already have them.
 */
export function UserMenu({ trigger, align = "left" }: { trigger: Parameters<typeof Dropdown>[0]["trigger"]; align?: "left" | "right" }) {
  const items = useAccountMenu();
  if (!items) return null;
  return <Dropdown items={items} trigger={trigger} align={align} width={232} label="Account menu" />;
}

/** The account menu's items, shared by the dropdown (desktop) and the "Me" sheet (phones). Null when signed out. */
export function useAccountMenu(): MenuEntry[] | null {
  const router = useRouter();
  const { user } = useAuth();
  const card = useProfileCard();
  const setStatus = useSetStatus();
  // big screens have Saved in the Communities panel already; phones reach it from here (the Me tab)
  const wide = useMediaQuery("(min-width: 1024px)");
  // in the desktop app, "Desktop app" (go and download it) makes no sense
  const inApp = useInDesktopApp();
  if (!user) return null;
  return [
    // your status: one row, the four choices beside it
    {
      type: "submenu",
      label: `Status: ${PRESENCES.find((s) => s.id === user.presence)?.label}`,
      leading: <StatusIcon presence={user.presence} />,
      width: 210,
      items: PRESENCES.map((s): MenuEntry => ({ label: s.label, leading: <StatusIcon presence={s.id} />, checked: s.id === user.presence, onSelect: () => void setStatus(s.id) })),
    },
    { type: "sep" },
    { label: "Your profile", icon: "user", onSelect: () => card.openFull(user.handle) },
    { label: "My events", icon: "calendar", onSelect: () => router.push("/saved") },
    { label: "My kliques", icon: "users", onSelect: () => router.push("/kliques?tab=joined") },
    { label: "Advertise", icon: "megaphone", onSelect: () => router.push("/ads") },
    { label: "Plan & points", icon: "coin", onSelect: () => router.push("/settings?tab=plan") },
    { label: "Settings", icon: "sliders", onSelect: () => router.push("/settings") },
    ...(inApp ? [] : ([{ label: "Desktop app", icon: "download", onSelect: () => router.push("/download") }] as MenuEntry[])),
    ...(user.isAdmin ? ([{ label: "Admin console", icon: "shield", onSelect: () => router.push("/admin") }] as MenuEntry[]) : []),
    { type: "sep" },
    { label: "Sign out", icon: "logout", danger: true, onSelect: () => askSignOut() },
  ];
}

