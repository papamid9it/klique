import { readQuery, withApi } from "@/server/http/api";
import { getHistory } from "@/server/services/points.service";
import { pointsHistoryQuery } from "@/server/validators/schemas";

/** Older points history, 30 at a time. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => getHistory(viewer, readQuery(req, pointsHistoryQuery).before));
