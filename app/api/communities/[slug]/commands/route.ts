import { withApi } from "@/server/http/api";
import { commandsHere } from "@/server/services/bots.service";

/** Slash commands from this community's bots (for the "/" menu). */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => commandsHere(viewer, params.slug));
