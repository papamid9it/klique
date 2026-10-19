import { readJson, withApi } from "@/server/http/api";
import { deleteSubcommunity, getSubcommunity, updateSubcommunity } from "@/server/services/subcommunities.service";
import { subUpdateSchema } from "@/server/validators/schemas";

type P = { slug: string; subSlug: string };

export const GET = withApi<P, "optional">({ auth: "optional" }, async ({ params, viewer }) =>
  getSubcommunity(viewer, params.slug, params.subSlug),
);

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const patch = await readJson(req, subUpdateSchema);
  return updateSubcommunity(viewer, params.slug, params.subSlug, patch);
});

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) =>
  deleteSubcommunity(viewer, params.slug, params.subSlug),
);
