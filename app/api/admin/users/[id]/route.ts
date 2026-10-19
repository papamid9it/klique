import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, revokeSessions, setCanHostPublic, setSuspended, userDetail } from "@/server/services/admin.service";
import { adminUserUpdateSchema } from "@/server/validators/schemas";
import type { AdminUserDTO } from "@/lib/types";

export const GET = withApi<{ id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  assertAdmin(viewer);
  return userDetail(params.id);
});

/** Grant / revoke public hosting, suspend / restore, or sign out everywhere. */
export const PATCH = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  assertAdmin(viewer);
  const input = await readJson(req, adminUserUpdateSchema);
  let out: AdminUserDTO | null = null;
  if (input.canHostPublic !== undefined) out = await setCanHostPublic(viewer, params.id, input.canHostPublic);
  if (input.suspended !== undefined) out = await setSuspended(viewer, params.id, input.suspended, input.reason);
  if (input.signOut) out = await revokeSessions(viewer, params.id);
  return out;
});
