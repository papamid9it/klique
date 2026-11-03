import { created, readJson, withApi } from "@/server/http/api";
import { createRole, listRoles, roleInput } from "@/server/services/roles.service";

type P = { slug: string };

/** The community's custom roles, top first (members can see them). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => listRoles(viewer, params.slug));

/** Make a role (the owner, or "Manage roles"): it goes just under your own highest role. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => created(await createRole(viewer, params.slug, await readJson(req, roleInput))));
