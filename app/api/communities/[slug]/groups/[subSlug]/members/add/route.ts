import { readJson, readQuery, withApi } from "@/server/http/api";
import { addableMembers, addGroupMembers } from "@/server/services/subcommunities.service";
import { groupAddableQuery, groupAddSchema } from "@/server/validators/schemas";

type P = { slug: string; subSlug: string };

/** Community members who could be added to this group (group owners and admins only). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { q } = readQuery(req, groupAddableQuery);
  return addableMembers(viewer, params.slug, params.subSlug, q);
});

/** Add people from the community to the group (50 people at most). */
export const POST = withApi<P, "required">({ auth: "required", limit: { name: "group-add", max: 30, windowMs: 60_000 } }, async ({ req, params, viewer }) => {
  const { userIds } = await readJson(req, groupAddSchema);
  return addGroupMembers(viewer, params.slug, params.subSlug, userIds);
});
