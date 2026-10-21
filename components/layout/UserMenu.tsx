"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Dropdown, type MenuEntry } from "@/components/ui/Dropdown";

/**
 * Your account menu: profile, ads, settings, admin, sign out. One menu used from the sidebar's profile card,
 * the slim rail's picture, and your own profile page on phones. Notifications aren't here: the sidebar and the
 * phone top bar already have them.
 */
export function UserMenu({ trigger, align = "left" }: { trigger: Parameters<typeof Dropdown>[0]["trigger"]; align?: "left" | "right" }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  if (!user) return null;
  const items: MenuEntry[] = [
    { label: "Your profile", icon: "user", onSelect: () => router.push(`/people/${user.handle}`) },
    { label: "Advertise", icon: "megaphone", onSelect: () => router.push("/ads") },
    { label: `Points · ${(user.points ?? 0).toLocaleString("en-NG")}`, icon: "coin", onSelect: () => router.push("/settings?tab=points") },
    { label: "Settings", icon: "sliders", onSelect: () => router.push("/settings") },
    ...(user.isAdmin ? ([{ label: "Admin console", icon: "shield", onSelect: () => router.push("/admin") }] as MenuEntry[]) : []),
    { type: "sep" },
    { label: "Sign out", icon: "logout", danger: true, onSelect: () => void signOut() },
  ];
  return <Dropdown items={items} trigger={trigger} align={align} width={232} label="Account menu" />;
}
