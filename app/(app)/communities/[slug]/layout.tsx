import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { communityShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  // public data only, so it's cached (refreshed within a minute) and part of the instant first paint
  "use cache";
  cacheLife("minutes");
  const { slug } = await params;
  const s = await communityShare(slug);
  if (!s) return {};
  return {
    title: s.title,
    description: s.description,
    openGraph: { title: s.title, description: s.description },
    twitter: { card: "summary_large_image", title: s.title, description: s.description },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
