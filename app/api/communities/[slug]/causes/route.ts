import { readJson, withApi } from "@/server/http/api";
import { listCauses, saveCause } from "@/server/services/causes.service";
import { causeSchema } from "@/server/validators/schemas";

type P = { slug: string };

/** A community's causes (anyone who can see it), and what giving and making them takes. */
export const GET = withApi<P, "optional">({ auth: "optional" }, async ({ params, viewer }) => listCauses(viewer, params.slug));

/** Start a cause (owner and admins, once the community is big and old enough). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => saveCause(viewer, params.slug, await readJson(req, causeSchema)));
