import { readQuery, withApi } from "@/server/http/api";
import { serveAds } from "@/server/services/ads.service";
import { adServeQuery } from "@/server/validators/schemas";

/** The ad(s) for one spot on a page, chosen by place, scene and search words. Empty when nothing fits. */
export const GET = withApi({ auth: "optional", limit: { name: "ads", max: 240, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const q = readQuery(req, adServeQuery);
  return serveAds(viewer, { slot: q.slot, where: q.where, interest: q.interest, search: q.q, exclude: q.exclude, count: q.count });
});
