import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { searchDirectMessages } from "@/server/services/search.service";

const query = z.object({ q: z.string().trim().max(300).default(""), c: z.string().regex(/^[a-f0-9]{24}$/i).optional() });

/** Search your direct messages (all chats, or one with `c`): text plus from:, has:, before:/after:/during:. */
export const GET = withApi({ auth: "required", limit: { name: "dm-search", max: 60, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const { q, c } = readQuery(req, query);
  return searchDirectMessages(viewer, q, c);
});
