import { readQuery, withApi } from "@/server/http/api";
import { search } from "@/server/services/discover.service";
import { searchQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional", limit: { name: "search", max: 120, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const { q, where } = readQuery(req, searchQuery);
  return search(viewer, q, where);
});
