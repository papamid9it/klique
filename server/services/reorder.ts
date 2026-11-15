import type { Model, Types } from "mongoose";

export type Move = "top" | "up" | "down" | "bottom";

/**
 * Move one item among its siblings (channels in a category, the categories, the boards) and number them all
 * 0, 1, 2… again, so the order is the same for everyone. `siblings` is the whole list in its current order.
 */
export async function moveAmong(model: Model<never>, siblings: { _id: Types.ObjectId }[], id: Types.ObjectId, move: Move) {
  const list = siblings.map((s) => s._id);
  const at = list.findIndex((x) => String(x) === String(id));
  if (at < 0) return;
  const [item] = list.splice(at, 1);
  const to = move === "top" ? 0 : move === "bottom" ? list.length : move === "up" ? Math.max(0, at - 1) : Math.min(list.length, at + 1);
  list.splice(to, 0, item);
  await model.bulkWrite(list.map((_id, position) => ({ updateOne: { filter: { _id }, update: { $set: { position } } } })) as never);
}
