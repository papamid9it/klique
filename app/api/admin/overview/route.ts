import { withApi } from "@/server/http/api";
import { adminOverview, assertAdmin, OVERVIEW_RANGES } from "@/server/services/admin.service";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const days = Number(new URL(req.url).searchParams.get("days"));
  return adminOverview(OVERVIEW_RANGES.find((d) => d === days) ?? 30);
});
