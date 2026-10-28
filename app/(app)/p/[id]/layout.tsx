import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { postShare } from "@/server/services/share.service";
import { postMetadata } from "@/lib/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // what a signed-out visitor could see (a plain card for private, 18+ and explicit posts), cached like communities
  "use cache";
  cacheLife("minutes");
  const { id } = await params;
  return postMetadata(id, await postShare(id));
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
