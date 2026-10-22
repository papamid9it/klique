import "server-only";
import { Types } from "mongoose";
import type { SavedStickerDTO } from "@/lib/types";
import { badRequest, conflict, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { SavedSticker, type ISavedSticker } from "../models/SavedSticker";
import type { IUser } from "../models/User";
import { sid } from "./helpers";
import { keyFromUrl } from "./r2";
import { publish, rtChannel } from "./realtime";

/** How many stickers one account can keep. */
export const MAX_STICKERS = 200;

/**
 * A picture link that may be used as a sticker, normalised to the full-size file, or null. Only our own uploaded
 * pictures (and the bundled /mock samples used in development): no hotlinking other sites into chats.
 */
export function stickerSource(raw: string): string | null {
  const url = raw.trim().split("#")[0];
  if (/^\/mock\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(url)) return url;
  const key = keyFromUrl(url);
  if (!key || !/^klique\/(photos|avatars)\//.test(key) || !/\.(webp|jpe?g|png|gif)$/i.test(key)) return null;
  return url.split("?")[0].replace(/_sm\.(webp|jpe?g)$/i, ".$1");
}

/** For the send endpoints: the sticker picture, checked, or a 400. */
export function assertStickerUrl(raw: string): string {
  const url = stickerSource(raw);
  if (!url) throw badRequest("That sticker isn't available.");
  return url;
}

const toDTO = (s: ISavedSticker): SavedStickerDTO => ({ id: sid(s._id), url: s.url, uses: s.uses ?? 0, lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null });
/** let this person's other devices (and other tabs) refresh their sticker tray */
const ping = (userId: Types.ObjectId) => publish([rtChannel.user(userId)], { type: "stickers" });

/** Someone sent a picture sticker: if it's one of their saved ones, count it (fire-and-forget). */
export function noteStickerUse(userId: Types.ObjectId, url: string | null) {
  if (!url) return;
  void SavedSticker.updateOne({ userId, url }, { $inc: { uses: 1 }, $set: { lastUsedAt: new Date() } })
    .then((r) => r.modifiedCount && ping(userId))
    .catch(() => undefined);
}

export async function listStickers(viewer: IUser): Promise<SavedStickerDTO[]> {
  const rows = await SavedSticker.find({ userId: viewer._id }).sort({ order: 1, _id: -1 }).limit(MAX_STICKERS).lean<ISavedSticker[]>();
  return rows.map(toDTO);
}

/** Save a picture as a sticker. It goes to the front of the tray; saving one you already have moves it there. */
export async function saveSticker(viewer: IUser, rawUrl: string): Promise<SavedStickerDTO[]> {
  rateLimit(`sticker-save:${sid(viewer._id)}`, 60, 60_000);
  const url = stickerSource(rawUrl);
  if (!url) throw badRequest("Only pictures posted on Klique can be saved as stickers.");
  const first = await SavedSticker.findOne({ userId: viewer._id }).sort({ order: 1 }).select("order").lean<{ order: number }>();
  const order = (first?.order ?? 0) - 1;
  const had = await SavedSticker.exists({ userId: viewer._id, url });
  if (!had && (await SavedSticker.countDocuments({ userId: viewer._id })) >= MAX_STICKERS) {
    throw conflict(`You can keep up to ${MAX_STICKERS} stickers. Remove some to save more.`);
  }
  await SavedSticker.updateOne({ userId: viewer._id, url }, { $set: { order }, $setOnInsert: { userId: viewer._id, url } }, { upsert: true });
  ping(viewer._id);
  return listStickers(viewer);
}

export async function removeSticker(viewer: IUser, id: string): Promise<SavedStickerDTO[]> {
  if (!Types.ObjectId.isValid(id)) throw notFound("That sticker is gone.");
  await SavedSticker.deleteOne({ _id: id, userId: viewer._id });
  // the file stays: the messages it was sent in still show it (the nightly sweep clears files nothing uses)
  ping(viewer._id);
  return listStickers(viewer);
}

/** Put the tray in this order. Stickers not listed keep their place after the listed ones. */
export async function reorderStickers(viewer: IUser, ids: string[]): Promise<SavedStickerDTO[]> {
  rateLimit(`sticker-order:${sid(viewer._id)}`, 60, 60_000);
  const valid = ids.filter((i) => Types.ObjectId.isValid(i)).slice(0, MAX_STICKERS);
  if (valid.length) {
    await SavedSticker.bulkWrite(valid.map((id, order) => ({ updateOne: { filter: { _id: new Types.ObjectId(id), userId: viewer._id }, update: { $set: { order } } } })));
    await SavedSticker.updateMany({ userId: viewer._id, _id: { $nin: valid.map((i) => new Types.ObjectId(i)) } }, { $max: { order: valid.length } });
  }
  ping(viewer._id);
  return listStickers(viewer);
}
