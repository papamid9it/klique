import { shareImage } from "@/lib/share-image";
import { postShare } from "@/server/services/share.service";

/** A post's share picture (its first picture; a plain card for anything private, 18+ or explicit). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return shareImage(await postShare(id));
}
