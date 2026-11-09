import { withApi } from "@/server/http/api";
import { giftTray } from "@/server/services/gifts.service";

/** The gift tray: the catalogue and your Hype balance. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => giftTray(viewer));
