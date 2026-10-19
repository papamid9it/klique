import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, setCanHostPublic, setSuspended } from "@/server/services/admin.service";
import { adminUserUpdateSchema } from "@/server/validators/schemas";
import type { AdminUserDTO } from "@/lib/types";

/** Grant / revoke public hosting, or suspend / restore an account. */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const input = await readJson(req, adminUserUpdateSchema);
  let out: AdminUserDTO | null = null;
  if (input.canHostPublic !== undefined) out = await setCanHostPublic(params.id, input.canHostPublic);
  if (input.suspended !== undefined) out = await setSuspended(viewer, params.id, input.suspended, input.reason);
  return out;
});
