import { created, readJson, withApi } from "@/server/http/api";
import { createSubcommunity, listSubcommunities } from "@/server/services/subcommunities.service";
import { subCreateSchema } from "@/server/validators/schemas";

type P = { slug: string };

export const GET = withApi<P, "optional">({ auth: "optional" }, async ({ params, viewer }) => listSubcommunities(viewer, params.slug));

export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const input = await readJson(req, subCreateSchema);
  return created(await createSubcommunity(viewer, params.slug, input));
});
