import { withApi } from "@/server/http/api";
import { removeSticker } from "@/server/services/stickers.service";

type P = { id: string };

/** DELETE /api/me/stickers/:id — take a sticker out of your tray (messages it was sent in keep showing it). */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => removeSticker(viewer, params.id));
