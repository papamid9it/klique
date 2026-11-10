import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { communityHome } from "@/server/services/community-home.service";
import { whereParam } from "@/server/validators/common";

const query = z.object({ page: z.coerce.number().int().min(1).max(30).default(1), at: z.coerce.number().int().positive().optional(), where: whereParam });

/** Home in the Communities style: mostly events, then kliques, a few posts from your communities (pages of 10). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const q = readQuery(req, query);
  return communityHome(viewer, q.page, q.at, q.where);
});
