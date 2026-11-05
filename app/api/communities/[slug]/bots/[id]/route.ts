import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { setBotReadMessages, uninstallBot } from "@/server/services/bots.service";

const patch = z.object({ readMessages: z.boolean() });

/** Let a bot read messages from now on, or stop it. */
export const PATCH = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setBotReadMessages(viewer, params.slug, params.id, (await readJson(req, patch)).readMessages));

/** Remove a bot from the community (its role goes with it). */
export const DELETE = withApi<{ slug: string; id: string }, "required">({ auth: "required" }, async ({ params, viewer }) => uninstallBot(viewer, params.slug, params.id));
