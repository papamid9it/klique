import { shareImage } from "@/lib/share-image";
import { topicShare } from "@/server/services/share.service";

/** A topic's share picture (topics open inside their community's page, so the image lives here). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return shareImage(/^[a-f0-9]{24}$/.test(id) ? await topicShare(slug, id) : null);
}
