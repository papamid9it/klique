import { bump, remember } from "@/server/cache";
import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { createCommunity, listCommunities } from "@/server/services/communities.service";
import { communityCreateSchema, communityListQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional", publicCache: 30 }, async ({ req, viewer }) => {
  const query = readQuery(req, communityListQuery);
  if (!viewer) return remember("public", `communities:${JSON.stringify(query)}`, 45, () => listCommunities(null, query));
  return listCommunities(viewer, query);
});

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const input = await readJson(req, communityCreateSchema);
  const community = await createCommunity(viewer, input);
  await bump("public"); // new community: anonymous lists refresh straight away
  return created(community);
});
