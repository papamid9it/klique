import { botJson, botRoute } from "@/server/http/bot-api";
import { commandsSchema, registerCommands } from "@/server/services/bots.service";

/** Register the bot's slash commands (replaces the list; up to 25). */
export const PUT = botRoute(async ({ req, app }) => registerCommands(app, (await botJson(req, commandsSchema)).commands));
