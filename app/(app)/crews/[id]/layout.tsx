import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { crewShare } from "@/server/services/share.service";
import { crewMetadata } from "@/lib/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // what a signed-out visitor could see (never the meetup point), cached like events
  "use cache";
  cacheLife("minutes");
  const { id } = await params;
  return crewMetadata(id, await crewShare(id));
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
