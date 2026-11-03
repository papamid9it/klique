import { readJson, withApi } from "@/server/http/api";
import { memberRolesInput, setMemberRoles } from "@/server/services/roles.service";

/** The roles someone holds in the community (you change only those below your own). */
export const PUT = withApi<{ slug: string; userId: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setMemberRoles(viewer, params.slug, params.userId, (await readJson(req, memberRolesInput)).roleIds));
