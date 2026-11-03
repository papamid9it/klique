import { withApi } from "@/server/http/api";
import { uninstallBot } from "@/server/services/bots.service";

/** Remove a bot from the community (its role goes with it). */
export const DELETE = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => uninstallBot(viewer, params.slug, params.id));
