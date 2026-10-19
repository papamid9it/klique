import { z } from "zod";
import { readJson, readQuery, withApi } from "@/server/http/api";
import { registerPushToken, removePushToken } from "@/server/services/push.service";

const body = z.object({ token: z.string().trim().min(10).max(200), platform: z.enum(["ios", "android"]).default("android") });

/** The phone app registers (POST) or forgets (DELETE) its notification address. */
export const POST = withApi({ auth: "required", limit: { name: "push", max: 20, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const { token, platform } = await readJson(req, body);
  return registerPushToken(viewer, token, platform);
});

export const DELETE = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { token } = readQuery(req, body.pick({ token: true }));
  return removePushToken(viewer, token);
});
