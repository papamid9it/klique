import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import type { ReactNode } from "react";
import { inviteMetadata } from "@/lib/share-metadata";
import { inviteShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  // the same for everyone, so it's cached (refreshed within a minute) like a community's
  "use cache";
  cacheLife("minutes");
  const { code } = await params;
  return inviteMetadata(code, await inviteShare(code));
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
