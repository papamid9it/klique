import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { profileShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  // public data only (a hidden profile shows just the name), so it's cached like events and communities
  "use cache";
  cacheLife("minutes");
  const { handle } = await params;
  const s = await profileShare(handle);
  if (!s) return {};
  return {
    title: s.title,
    description: s.description,
    openGraph: { type: "profile", title: s.title, description: s.description },
    twitter: { card: "summary_large_image", title: s.title, description: s.description },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
