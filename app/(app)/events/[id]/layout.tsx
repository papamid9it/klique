import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense, type ReactNode } from "react";
import { JsonLd } from "@/components/seo/JsonLd";
import { eventJsonLd } from "@/server/services/seo.service";
import { eventShare } from "@/server/services/share.service";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // public data only, so it's cached (refreshed within a minute) and part of the instant first paint
  "use cache";
  cacheLife("minutes");
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

/** the event's facts for Google (its event listings), from public data, cached like the title and description */
async function EventFacts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JsonLd data={await factsFor(id)} />;
}
async function factsFor(id: string) {
  "use cache";
  cacheLife("minutes");
  return eventJsonLd(id);
}

export default function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <EventFacts params={params} />
      </Suspense>
    </>
  );
}
