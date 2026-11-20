import type { Connection } from "mongoose";
import type { ObjectId } from "mongodb";

/**
 * One-off (Nov 2026): deleted messages and comments from before the new rules leave the chat altogether, the same
 * as ones deleted from now on (channels.service deleteMessage, feed.service deleteComment):
 *  - a community chat message stays as a "Message deleted" line only if its writer deleted it and someone replied
 *    to it (or it started a thread); otherwise it's marked `gone` and no longer shown;
 *  - a comment stays as "Comment deleted" only while a reply under it is still there.
 * Nothing is removed from the database: rows are only marked. Direct messages and group chats keep their lines.
 * It runs once per database (the first run claims "migration:deleted-gone-v1" in app settings).
 */
export const DELETED_MIGRATION = "migration:deleted-gone-v1";

type Setting = { _id: string; value?: unknown; updatedAt?: Date };
type Row = { _id: ObjectId; authorId?: ObjectId; deletedById?: ObjectId | null; thread?: unknown; parentId?: ObjectId | null };

export async function migrateDeleted(conn: Connection): Promise<"migrated" | "already done"> {
  const db = conn.db;
  if (!db) throw new Error("Not connected.");
  const settings = db.collection<Setting>("appsettings");
  try {
    await settings.insertOne({ _id: DELETED_MIGRATION, value: { state: "running", startedAt: new Date() }, updatedAt: new Date() });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return "already done";
    throw e;
  }

  // community chat
  const messages = db.collection<Row>("channelmessages");
  const deleted = await messages.find({ deletedAt: { $ne: null }, gone: { $ne: true } }).project<Row>({ _id: 1, authorId: 1, deletedById: 1, thread: 1 }).toArray();
  let messagesGone = 0;
  for (let i = 0; i < deleted.length; i += 500) {
    const batch = deleted.slice(i, i + 500);
    const answered = new Set((await messages.distinct("replyToId", { replyToId: { $in: batch.map((m) => m._id) }, deletedAt: null })).map(String));
    const gone = batch.filter((m) => {
      // removed by someone else (a moderator): always gone. No record of who: treat as its writer.
      const own = !m.deletedById || String(m.deletedById) === String(m.authorId);
      return !(own && (!!m.thread || answered.has(String(m._id))));
    });
    if (gone.length) messagesGone += (await messages.updateMany({ _id: { $in: gone.map((m) => m._id) } }, { $set: { gone: true } })).modifiedCount;
  }

  // comments: a deleted one with no reply still there goes; repeat, since a parent can be left with none in turn
  const comments = db.collection<Row>("feedcomments");
  let commentsGone = 0;
  for (let round = 0; round < 5; round++) {
    const dead = await comments.find({ deletedAt: { $ne: null }, gone: { $ne: true } }).project<Row>({ _id: 1 }).toArray();
    if (!dead.length) break;
    const withReplies = new Set((await comments.distinct("parentId", { parentId: { $in: dead.map((c) => c._id) }, gone: { $ne: true } })).map(String));
    const gone = dead.filter((c) => !withReplies.has(String(c._id)));
    if (!gone.length) break;
    commentsGone += (await comments.updateMany({ _id: { $in: gone.map((c) => c._id) } }, { $set: { gone: true } })).modifiedCount;
  }

  await settings.updateOne({ _id: DELETED_MIGRATION }, { $set: { value: { state: "done", messagesGone, commentsGone, finishedAt: new Date() }, updatedAt: new Date() } });
  return "migrated";
}
