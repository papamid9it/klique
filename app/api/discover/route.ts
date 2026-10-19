import { remember } from "@/server/cache";
import { readQuery, withApi } from "@/server/http/api";
import { discover } from "@/server/services/discover.service";
import { discoverQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional", publicCache: 30 }, async ({ req, viewer }) => {
  const { where } = readQuery(req, discoverQuery);
  // Signed-out visitors all see the same thing, so one shared copy (Redis) serves them all.
  if (!viewer) return remember("public", `discover:${where ?? ""}`, 45, () => discover(null, where));
  return discover(viewer, where);
});
