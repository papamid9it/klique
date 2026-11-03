import { readJson, withApi } from "@/server/http/api";
import { interactionSchema, runCommand } from "@/server/services/bots.service";

/** Use a slash command in this channel: the bot is asked, and its answer (if any) is posted. */
export const POST = withApi<{ slug: string; channelSlug: string }, "required">({ auth: "required", limit: { name: "slash", max: 30, windowMs: 60_000 } }, async ({ req, params, viewer }) => runCommand(viewer, params.slug, params.channelSlug, await readJson(req, interactionSchema)));
