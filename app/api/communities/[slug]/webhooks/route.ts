import { readJson, withApi } from "@/server/http/api";
import { createWebhook, listWebhooks, webhookCreateSchema } from "@/server/services/webhooks.service";

type P = { slug: string };

/** The community's channel webhooks (owner and admins). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => listWebhooks(viewer, params.slug));

/** Make a webhook (owner or admin on Pro): the link with its secret comes back this once. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => createWebhook(viewer, params.slug, await readJson(req, webhookCreateSchema)));
