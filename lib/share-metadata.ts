import type { Metadata } from "next";
import { SHARE_IMAGE } from "./share-image";

type Share = { title: string; description: string } | null;

/** Title, description and share picture for a page whose picture comes from an /og/… route. */
function withImage(s: Share, image: string, alt: string): Metadata {
  if (!s) return {};
  const images = [{ url: image, width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, type: SHARE_IMAGE.type, alt }];
  return {
    title: s.title,
    description: s.description,
    openGraph: { title: s.title, description: s.description, images },
    twitter: { card: "summary_large_image", title: s.title, description: s.description, images },
  };
}

export const crewMetadata = (id: string, s: Share) => withImage(s, `/og/crew/${id}`, "A crew on klique.");
export const topicMetadata = (slug: string, id: string, s: Share) => withImage(s, `/og/topic/${slug}/${id}`, "A topic on klique.");
export const communityMetadata = (slug: string, s: Share) => withImage(s, `/og/community/${slug}`, "A community on klique.");
