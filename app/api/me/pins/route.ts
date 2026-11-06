import { readJson, withApi } from "@/server/http/api";
import { setPin } from "@/server/services/pins.service";
import { listPinSchema } from "@/server/validators/schemas";

/** Pin or unpin a chat or a community, for yourself. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => setPin(viewer, await readJson(req, listPinSchema)));
