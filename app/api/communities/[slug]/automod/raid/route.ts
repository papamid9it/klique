import { withApi } from "@/server/http/api";
import { endRaidLock } from "@/server/services/automod.service";

/** End raid protection's lock early: joining works as usual again. */
export const DELETE = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => endRaidLock(viewer, params.slug));
