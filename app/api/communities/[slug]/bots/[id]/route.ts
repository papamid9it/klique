import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { botRulesSchema, setBotReadMessages, setBotRules, uninstallBot } from "@/server/services/bots.service";

const patch = z.object({ readMessages: z.boolean().optional(), rules: botRulesSchema.optional() });

/** Let a bot read messages from now on, or stop it; or set who may use its commands, where, and how often. */
export const PATCH = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const body = await readJson(req, patch);
  const out: { readMessages?: boolean; rules?: unknown } = {};
  if (body.readMessages !== undefined) Object.assign(out, await setBotReadMessages(viewer, params.slug, params.id, body.readMessages));
  if (body.rules) Object.assign(out, await setBotRules(viewer, params.slug, params.id, body.rules));
  return out;
});

/** Remove a bot from the community (its role goes with it). */
export const DELETE = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => uninstallBot(viewer, params.slug, params.id));
