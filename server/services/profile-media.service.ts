import "server-only";
import type { TopicMediaDTO, UserMe } from "@/lib/types";
import { PLAN_NAMES } from "@/lib/plans";
import { badRequest, forbidden } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { User, type IUser } from "../models/User";
import { toMe } from "../serializers";
import { sid } from "./helpers";
import { deleteUploads } from "./media.service";
import { keyFromUrl } from "./r2";
import { getPlanConfig, planOf } from "./subscriptions.service";

/**
 * Profile media (the gallery): photos and short videos on someone's profile, shown on their profile card and page.
 * How many is their plan's, any mix of photos and videos (lib/plans: Free 2, Lite 4, Pro 6; Admin → Plans). Files
 * are our own uploads only (R2, compressed on the device like feed pictures and videos, videos with a still frame).
 * Replacing or removing one deletes the old file from storage.
 * After a paid plan ends nothing is deleted or hidden: everything stays on the profile, and they can remove or
 * reorder, but not add or replace, until they're within their plan's slots again.
 */

type Item = { kind: "image" | "video"; url: string; poster: string | null };

/** What others see: all of it (going down a plan hides nothing). */
export async function shownMedia(user: Pick<IUser, "media">): Promise<TopicMediaDTO[]> {
  return (user.media ?? []).map((m) => ({ kind: m.kind, url: m.url, poster: m.poster ?? null }));
}

/** Replace your profile media with this list (add, reorder, replace, remove all go through here). */
export async function setProfileMedia(viewer: IUser, items: Item[]): Promise<UserMe> {
  rateLimit(`profile-media:${sid(viewer._id)}`, 40, 60 * 60_000);
  const c = await getPlanConfig();
  const plan = planOf(viewer);
  const slots = c.mediaSlots[plan];
  const before = (await User.findById(viewer._id).select("media").lean<Pick<IUser, "media">>())?.media ?? [];
  if (items.length > slots) {
    // over the plan's slots (a paid plan ended): removing and reordering are fine, adding or replacing isn't
    const had = new Set(before.map((m) => m.url));
    const adds = items.some((m) => !had.has(m.url));
    if (adds || items.length > before.length) {
      const over = Math.max(1, before.length - slots);
      throw forbidden(`You're on ${PLAN_NAMES[plan]}, which has ${slots} ${slots === 1 ? "slot" : "slots"}: remove ${over} to add new ones${plan !== "pro" ? ", or upgrade" : ""}.`);
    }
  }
  // only files uploaded here (never someone else's link)
  for (const m of items) {
    if (!keyFromUrl(m.url) || (m.poster && !keyFromUrl(m.poster))) throw badRequest("Upload the photo or video here.");
    if (m.kind === "video" && !m.poster) throw badRequest("That video is missing its still frame. Upload it again.");
  }
  const unique = new Set(items.map((m) => m.url));
  if (unique.size !== items.length) throw badRequest("The same photo is in two slots.");

  const next = items.map((m) => ({ kind: m.kind, url: m.url, poster: m.kind === "video" ? m.poster : null }));
  const me = await User.findByIdAndUpdate(viewer._id, { $set: { media: next } }, { returnDocument: "after" }).lean<IUser>();
  // files that are no longer used (replaced or removed) go from storage
  const kept = new Set(next.flatMap((m) => [m.url, m.poster]).filter(Boolean));
  deleteUploads(before.flatMap((m) => [m.url, m.poster]).filter((u): u is string => !!u && !kept.has(u)));
  return toMe(me!);
}

/** A site admin takes one item off someone's profile (and out of storage). */
export async function adminRemoveProfileMedia(userId: string, url: string): Promise<{ removed: boolean; handle: string }> {
  const u = await User.findById(userId).select("media handle").lean<Pick<IUser, "_id" | "media" | "handle">>();
  if (!u) throw badRequest("We couldn't find that person.");
  const item = (u.media ?? []).find((m) => m.url === url);
  if (!item) return { removed: false, handle: u.handle };
  await User.updateOne({ _id: u._id }, { $pull: { media: { url } } });
  deleteUploads([item.url, item.poster], { force: true });
  return { removed: true, handle: u.handle };
}
