import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { installBot } from "@/server/services/bots.service";

const body = z.object({ community: z.string().trim().min(1).max(80), permissions: z.array(z.string()).max(20).default([]) });

/** Add the bot to a community you own (or manage bots in), with the permissions you choose. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { community, permissions } = await readJson(req, body);
  return installBot(viewer, params.id, community, permissions);
});
