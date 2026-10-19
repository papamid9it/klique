import { remember } from "@/server/cache";
import { readQuery, withApi } from "@/server/http/api";
import { eventsOverview } from "@/server/services/events.service";
import { eventOverviewQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional", publicCache: 30 }, async ({ req, viewer }) => {
  const query = readQuery(req, eventOverviewQuery);
  if (!viewer) return remember("public", `overview:${JSON.stringify(query)}`, 45, () => eventsOverview(null, query));
  return eventsOverview(viewer, query);
});
