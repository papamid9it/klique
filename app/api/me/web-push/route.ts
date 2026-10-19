import { z } from "zod";
import { readJson, readQuery, withApi } from "@/server/http/api";
import { registerWebPush, removeWebPush, webPushPublicKey } from "@/server/services/push.service";

const subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().trim().max(80).default(""),
});

/** The key a browser needs to subscribe (null when browser notifications aren't set up on the server). */
export const GET = withApi({ auth: "required" }, async () => ({ publicKey: webPushPublicKey() }));

/** This browser wants notifications (desktop, phone browser or the installed app). */
export const POST = withApi({ auth: "required", limit: { name: "web-push", max: 20, windowMs: 60_000 } }, async ({ req, viewer }) => {
  const { endpoint, keys, label } = await readJson(req, subscription);
  return registerWebPush(viewer, { endpoint, keys }, label);
});

export const DELETE = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { endpoint } = readQuery(req, z.object({ endpoint: z.url().max(1000) }));
  return removeWebPush(viewer, endpoint);
});
