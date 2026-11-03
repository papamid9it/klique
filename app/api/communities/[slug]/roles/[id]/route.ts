import { readJson, withApi } from "@/server/http/api";
import { deleteRole, roleInput, updateRole } from "@/server/services/roles.service";

type P = { slug: string; id: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => updateRole(viewer, params.slug, params.id, await readJson(req, roleInput.partial())));

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteRole(viewer, params.slug, params.id));
