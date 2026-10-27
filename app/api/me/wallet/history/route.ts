import { readQuery, withApi } from "@/server/http/api";
import { getHistory } from "@/server/services/wallet.service";
import { hypeHistoryQuery } from "@/server/validators/schemas";

/** Older Hype history, 30 at a time. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => getHistory(viewer, readQuery(req, hypeHistoryQuery).before));
