import { shareImage } from "@/lib/share-image";
import { inviteShare } from "@/server/services/share.service";

/** An invite link's share picture. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return shareImage(await inviteShare(code));
}
