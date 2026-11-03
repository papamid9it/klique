import { readJson, withApi } from "@/server/http/api";
import { deleteWebhook, updateWebhook, webhookUpdateSchema } from "@/server/services/webhooks.service";

type P = { slug: string; id: string };

/** Renew its secret, rename it, or allow @everyone / @here. */
export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => updateWebhook(viewer, params.slug, params.id, await readJson(req, webhookUpdateSchema)));

export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteWebhook(viewer, params.slug, params.id));
