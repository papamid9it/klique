import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense, type ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { communityJsonLd } from "@/server/services/seo.service";
import { communityMetadata } from "@/lib/share-metadata";
import { communityShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  // public data only, so it's cached (refreshed within a minute) and part of the instant first paint
  "use cache";
  cacheLife("minutes");
  const { slug } = await params;
  const s = await communityShare(slug);
  return communityMetadata(slug, s);
}

/** the community's facts for Google, from public data (public communities only), cached like the title */
async function CommunityFacts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JsonLd data={await factsFor(slug)} />;
}
async function factsFor(slug: string) {
  "use cache";
  cacheLife("minutes");
  return communityJsonLd(slug);
}

export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <CommunityFacts params={params} />
      </Suspense>
    </>
  );
}
