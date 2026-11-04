"use client";

import Link from "next/link";
import { useInDesktopApp } from "@/lib/hooks/useInDesktopApp";

/** "Desktop app" for the legal pages' links: not shown inside the desktop app itself. */
export function DesktopAppLink({ className }: { className?: string }) {
  if (useInDesktopApp()) return null;
  return (
    <Link href="/download" className={className}>
      Desktop app
    </Link>
  );
}
