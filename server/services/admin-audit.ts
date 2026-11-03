import "server-only";
import type { Types } from "mongoose";
import type { IAdminAction } from "../models/AdminAction";
import { ModAction } from "../models/ModAction";
import type { IUser } from "../models/User";

/**
 * Someone removed another person's content as a moderator: a site admin (anywhere) or a community's owner or admin
 * (in their community). One line in that community's moderation log (which its owner and admins can read), and one
 * in the site's admin audit log (who, what, when). Never throws: the deletion already happened.
 */
export async function logModDelete(
  actor: IUser,
  where: { communityId: Types.ObjectId | null | undefined; authorId?: Types.ObjectId | null },
  targetType: IAdminAction["targetType"],
  targetId: Types.ObjectId | string | null,
  label: string,
  href: string | null = null,
) {
  const text = label.slice(0, 200);
  try {
    if (where.communityId) await ModAction.create({ communityId: where.communityId, actorId: actor._id, action: "delete", targetType, targetId, label: text, authorId: where.authorId ?? null });
    const { logAction } = await import("./admin.service");
    await logAction(actor, "content.delete", targetType, targetId, text, "Removed as a moderator", href);
  } catch (e) {
    console.warn("[mod] couldn't log a deletion:", (e as Error).message);
  }
}
