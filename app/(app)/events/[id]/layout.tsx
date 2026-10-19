import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eventShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await eventShare(id);
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
