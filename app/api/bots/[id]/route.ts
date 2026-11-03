import { withApi } from "@/server/http/api";
import { botInvite } from "@/server/services/bots.service";

/** A bot's invite page: what it is, what it asks for, where you could add it. */
export const GET = withApi<{ id: string }>({ auth: "optional" }, async ({ params, viewer }) => botInvite(viewer, params.id));
