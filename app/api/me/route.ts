import { readJson, withApi } from "@/server/http/api";
import { getMe, updateMe } from "@/server/services/users.service";
import { profileUpdateSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => getMe(viewer));

export const PATCH = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const patch = await readJson(req, profileUpdateSchema);
  return updateMe(viewer, patch);
});
