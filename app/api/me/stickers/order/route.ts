import { readJson, withApi } from "@/server/http/api";
import { reorderStickers } from "@/server/services/stickers.service";
import { reorderStickersSchema } from "@/server/validators/schemas";

/** PUT /api/me/stickers/order { ids } — rearrange the tray. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => reorderStickers(viewer, (await readJson(req, reorderStickersSchema)).ids));
