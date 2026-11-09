import { readJson, withApi } from "@/server/http/api";
import { sendGift } from "@/server/services/gifts.service";
import { giftSendSchema } from "@/server/validators/schemas";

/** Send a gift to a post, comment, board post or board reply (paid with Hype; the same clientKey twice is one gift). */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => sendGift(viewer, await readJson(req, giftSendSchema)));
