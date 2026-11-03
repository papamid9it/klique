import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { suggest } from "@/server/services/tags.service";

const query = z.object({ kind: z.enum(["@", "#"]), q: z.string().trim().max(40).default("") });

/** As you type "@que" (people and communities) or "#que" (tags), in posts and comments. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => {
  const { kind, q } = readQuery(req, query);
  return suggest(viewer, kind, q);
});
