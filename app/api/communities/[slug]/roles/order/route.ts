import { readJson, withApi } from "@/server/http/api";
import { reorderRoles, roleOrderInput } from "@/server/services/roles.service";

/** New order of the roles below yours, top first. */
export const PUT = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => reorderRoles(viewer, params.slug, (await readJson(req, roleOrderInput)).ids));
