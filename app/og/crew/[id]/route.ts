import { shareImage } from "@/lib/share-image";
import { crewShare } from "@/server/services/share.service";

/** A crew's share picture (its links live under a community's address, so they can't have their own opengraph-image). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return shareImage(/^[a-f0-9]{24}$/.test(id) ? await crewShare(id) : null);
}
