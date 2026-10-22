import { CrewMessage, type ICrewMessage } from "../models/Crew";
import { Reaction } from "../models/Reaction";
import { deleteUploads } from "./media.service";

/** Delete crew chat messages with their pictures and reactions (crews called off, events deleted, accounts closed). */
export async function purgeCrewChat(where: Record<string, unknown>) {
  const rows = await CrewMessage.find(where).select("_id images").lean<Pick<ICrewMessage, "_id" | "images">[]>();
  if (!rows.length) return;
  const ids = rows.map((r) => r._id);
  deleteUploads(rows.flatMap((r) => r.images ?? []));
  await Promise.all([Reaction.deleteMany({ targetType: "crew", targetId: { $in: ids } }), CrewMessage.deleteMany({ _id: { $in: ids } })]);
}
