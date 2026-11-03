import { created, readJson, withApi } from "@/server/http/api";
import { botCreateSchema, createBot, myBots } from "@/server/services/bots.service";

/** Your bots (Settings → Developers). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => myBots(viewer));

/** Make a bot (Pro): its token comes back this once. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => created(await createBot(viewer, await readJson(req, botCreateSchema))));
