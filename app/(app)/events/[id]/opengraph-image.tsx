import { SHARE_IMAGE, shareImage } from "@/lib/share-image";
import { eventShare } from "@/server/services/share.service";

export const alt = "An event on klique.";
export const size = { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height };
export const contentType = SHARE_IMAGE.type;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return shareImage(await eventShare(id));
}
