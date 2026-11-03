import { readJson, withApi } from "@/server/http/api";
import { automodSchema, getAutoMod, setAutoMod } from "@/server/services/automod.service";

type P = { slug: string };

/** The community's AutoMod settings, and whether raid protection is locking joins right now (owner and admins). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => getAutoMod(viewer, params.slug));

export const PUT = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => setAutoMod(viewer, params.slug, await readJson(req, automodSchema)));
