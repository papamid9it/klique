import { readJson, withApi } from "@/server/http/api";
import { getWelcome, setWelcome, welcomeSchema } from "@/server/services/welcome.service";

type P = { slug: string };

/** The welcome screen: what members see when they join (and the settings, for owners and admins). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => getWelcome(viewer, params.slug));

export const PUT = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => setWelcome(viewer, params.slug, await readJson(req, welcomeSchema)));
