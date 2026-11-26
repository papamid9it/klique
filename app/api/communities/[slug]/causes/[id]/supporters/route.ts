import { withApi } from "@/server/http/api";
import { causeSupporters } from "@/server/services/causes.service";

type P = { slug: string; id: string };

/** Who gave to a cause, 30 at a time (`after`: the last one shown): the community's owner and admins only. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => causeSupporters(viewer, params.slug, params.id, new URL(req.url).searchParams.get("after")));
