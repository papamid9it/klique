import { created, readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { importFromFlyer } from "@/server/services/event-import.service";
import { adminFlyerSchema } from "@/server/validators/schemas";

/** Drop a flyer: the AI reads it, and its events land in the inbox as drafts. */
export const maxDuration = 60;

export const POST = withApi({ auth: "required", limit: { name: "admin-flyer", max: 20, windowMs: 60_000 } }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return created(await importFromFlyer(viewer, await readJson(req, adminFlyerSchema)));
});
