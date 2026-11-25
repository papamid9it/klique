import { readJson, withApi } from "@/server/http/api";
import { endCause, saveCause } from "@/server/services/causes.service";
import { causeSchema } from "@/server/validators/schemas";

type P = { slug: string; id: string };

/** Change a cause (owner and admins). */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => saveCause(viewer, params.slug, await readJson(req, causeSchema), params.id));

/** End a cause: hidden if it was given to (the record stays), else removed. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => endCause(viewer, params.slug, params.id));
