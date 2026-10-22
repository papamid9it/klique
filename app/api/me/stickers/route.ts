import { created, readJson, withApi } from "@/server/http/api";
import { listStickers, saveSticker } from "@/server/services/stickers.service";
import { saveStickerSchema } from "@/server/validators/schemas";

/** GET /api/me/stickers — your saved stickers, in tray order (same on every device). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => listStickers(viewer));

/** POST /api/me/stickers { url } — save a posted picture (or one you just uploaded) as a sticker. Returns the tray. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => created(await saveSticker(viewer, (await readJson(req, saveStickerSchema)).url)));
