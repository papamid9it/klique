import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { adminRemoveProfileMedia } from "@/server/services/profile-media.service";

type P = { id: string };
const query = z.object({ url: z.string().trim().min(1).max(2000) });

/** Site admins: take one photo or video off someone's profile (and out of storage). Logged. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { url } = readQuery(req, query);
  const r = await adminRemoveProfileMedia(params.id, url);
  if (r.removed) await logAction(viewer, "content.delete", "profileMedia", params.id, `Profile photo or video of @${r.handle}`, "Deleted by a site admin", null);
  return r;
});
