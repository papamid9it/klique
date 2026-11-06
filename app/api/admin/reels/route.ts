import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { assertAdmin, logAction } from "@/server/services/admin.service";
import { reelsSetting, setReelsSetting } from "@/server/services/feed.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return reelsSetting();
});

/** Turn reels on or off for everyone. Off: tapping a post just opens it. */
export const PUT = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const { on } = await readJson(req, z.object({ on: z.boolean() }));
  const next = await setReelsSetting(on);
  await logAction(viewer, "reels.switch", "points", null, "Reels", on ? "turned on" : "turned off", "/admin/system");
  return next;
});
