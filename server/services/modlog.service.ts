import "server-only";
import type { ModLogEntryDTO } from "@/lib/types";
import { forbidden } from "../http/errors";
import { ModAction, type IModAction } from "../models/ModAction";
import type { IUser } from "../models/User";
import { loadBriefs } from "../serializers";
import { sid } from "./helpers";
import { resolveSpaceFor } from "./spaces.service";

const PAGE = 50;

/** A community's moderation log, newest first: who removed whose what, when. Its owner and admins only. */
export async function communityModLog(viewer: IUser, slug: string, before?: string): Promise<{ items: ModLogEntryDTO[]; hasMore: boolean }> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!access.perms?.includes("viewModLog")) throw forbidden("You don't have permission to see the moderation log.");
  const q: Record<string, unknown> = { communityId: space.community._id };
  if (before) q.createdAt = { $lt: new Date(before) };
  const rows = await ModAction.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean<IModAction[]>();
  const page = rows.slice(0, PAGE);
  const people = await loadBriefs(page.flatMap((r) => [r.actorId, ...(r.authorId ? [r.authorId] : [])]));
  return {
    items: page.map((r) => ({ id: sid(r._id), action: r.action, targetType: r.targetType, label: r.label, actor: people.get(sid(r.actorId)) ?? null, author: r.authorId ? (people.get(sid(r.authorId)) ?? null) : null, createdAt: r.createdAt.toISOString() })),
    hasMore: rows.length > PAGE,
  };
}
