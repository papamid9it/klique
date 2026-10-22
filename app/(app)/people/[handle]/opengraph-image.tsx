import { SHARE_IMAGE, shareImage } from "@/lib/share-image";
import { profileShare } from "@/server/services/share.service";

export const alt = "A profile on klique.";
export const size = { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height };
export const contentType = SHARE_IMAGE.type;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return shareImage(await profileShare(handle));
}
