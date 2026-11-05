import { readJson, withApi } from "@/server/http/api";
import { buttonPressSchema, pressCardButton } from "@/server/services/bots.service";

/** Someone pressed a button on a bot's card: the bot is told, and its answer comes back or is posted. */
export const POST = withApi<{ slug: string; channelSlug: string; messageId: string }, "required">({ auth: "required", limit: { name: "card-button", max: 60, windowMs: 60_000 } }, async ({ req, params, viewer }) => pressCardButton(viewer, params.slug, params.channelSlug, params.messageId, (await readJson(req, buttonPressSchema)).buttonId));
