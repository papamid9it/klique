import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { setLiveNotify, setSuppressEveryone } from "@/server/services/communities.service";

const schema = z.object({ suppressEveryone: z.boolean().optional(), liveNotify: z.boolean().optional() }).refine((b) => b.suppressEveryone !== undefined || b.liveNotify !== undefined, "Nothing to change.");

/** Your notification settings in this community: "Suppress @everyone and @here", and "Live streams". */
export const PUT = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const b = await readJson(req, schema);
  const out: { suppressEveryone?: boolean; liveNotify?: boolean } = {};
  if (b.suppressEveryone !== undefined) Object.assign(out, await setSuppressEveryone(viewer, params.slug, b.suppressEveryone));
  if (b.liveNotify !== undefined) Object.assign(out, await setLiveNotify(viewer, params.slug, b.liveNotify));
  return out;
});
