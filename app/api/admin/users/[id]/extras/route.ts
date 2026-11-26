import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { setExtraLimit } from "@/server/services/limits.service";

const schema = z.object({ kind: z.enum(["kliqueStart", "kliqueIn", "communityCreate", "communityJoin"]), n: z.number().int().min(0).max(1000) });

/** Give someone extra on top of their plan for a month (n = 0 takes it away). Site admins; logged. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const { kind, n } = await readJson(req, schema);
  return setExtraLimit(viewer, params.id, kind, n);
});
