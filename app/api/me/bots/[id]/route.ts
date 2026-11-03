import { readJson, withApi } from "@/server/http/api";
import { botUpdateSchema, deleteBot, updateBot } from "@/server/services/bots.service";

type P = { id: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => updateBot(viewer, params.id, await readJson(req, botUpdateSchema)));

/** Delete the bot: it leaves every community and its account is switched off. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteBot(viewer, params.id));
