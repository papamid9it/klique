import { readJson, withApi } from "@/server/http/api";
import { setProfileMedia } from "@/server/services/profile-media.service";
import { profileMediaSchema } from "@/server/validators/schemas";

/** Your profile photos and videos, in order: the whole list (add, reorder, replace and remove all send it). */
export const PUT = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => setProfileMedia(viewer, (await readJson(req, profileMediaSchema)).items));
