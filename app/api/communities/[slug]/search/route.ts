import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { searchCommunity } from "@/server/services/search.service";

const query = z.object({
  q: z.string().trim().max(300).default(""),
  type: z.enum(["message", "topic", "post", "event", "klique", "member"]).optional(),
  sort: z.enum(["relevance", "newest"]).optional(),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

/** Search inside a community (Discord style: free text plus from:, in:, mentions:, has:, before:, after:, during:, pinned:, type:). */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { q, type, sort, page } = readQuery(req, query);
  return searchCommunity(viewer, params.slug, q, { type: type ?? null, sort, page });
});
