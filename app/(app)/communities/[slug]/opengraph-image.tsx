import { ImageResponse } from "next/og";
import { SHARE_SIZE, ShareCard } from "@/lib/share-card";
import { communityShare } from "@/server/services/share.service";

export const alt = "A community on klique.";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await communityShare(slug);
  return new ImageResponse(s ? <ShareCard eyebrow={s.eyebrow} title={s.title} lines={s.lines} image={s.image} /> : <ShareCard eyebrow="klique." title="Find your people." />, size);
}
