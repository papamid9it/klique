import { shareImage } from "@/lib/share-image";
import { communityShare } from "@/server/services/share.service";

/** A community's share picture (a route, not opengraph-image, so a crew or topic link inside it can use its own). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return shareImage(await communityShare(slug));
}
