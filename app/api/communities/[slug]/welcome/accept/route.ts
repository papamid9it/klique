import { readJson, withApi } from "@/server/http/api";
import { acceptWelcome, welcomeAcceptSchema } from "@/server/services/welcome.service";

/** Finish the welcome screen: accept the rules (when asked) and pick your own roles. */
export const POST = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => acceptWelcome(viewer, params.slug, await readJson(req, welcomeAcceptSchema)));
