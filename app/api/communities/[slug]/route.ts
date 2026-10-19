import { readJson, withApi } from "@/server/http/api";
import { deleteCommunity, getCommunity, updateCommunity } from "@/server/services/communities.service";
import { communityUpdateSchema } from "@/server/validators/schemas";

type P = { slug: string };

export const GET = withApi<P, "optional">({ auth: "optional" }, async ({ params, viewer }) => getCommunity(viewer, params.slug));

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, communityUpdateSchema);
  return updateCommunity(viewer, params.slug, patch);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteCommunity(viewer, params.slug));
