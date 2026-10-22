import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { DynamicMarker } from "@/components/layout/DynamicMarker";
import { crewMetadata, topicMetadata } from "@/lib/share-metadata";
import { crewShare, topicShare } from "@/server/services/share.service";
import { CommunityView } from "./CommunityView";

const ID = /^[a-f0-9]{24}$/;

/** public data only, so it's cached like the community's own preview */
async function crewPreview(id: string) {
  "use cache";
  cacheLife("minutes");
  return crewMetadata(id, await crewShare(id));
}

async function topicPreview(slug: string, id: string) {
  "use cache";
  cacheLife("minutes");
  return topicMetadata(slug, id, await topicShare(slug, id));
}

/**
 * A link to a crew (?crew=…) or a topic (?t=…) inside a community previews that crew or topic, not the community
 * (the layout's preview covers everything else).
 */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const crew = typeof sp.crew === "string" && ID.test(sp.crew) ? sp.crew : null;
  const topic = typeof sp.t === "string" && ID.test(sp.t) ? sp.t : null;
  if (crew) return crewPreview(crew);
  if (topic) return topicPreview(slug, topic);
  return {};
}

export default function CommunityPage() {
  return (
    <>
      <CommunityView />
      <DynamicMarker />
    </>
  );
}
