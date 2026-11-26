import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { setLivePass } from "@/server/services/live.service";

type P = { slug: string };

const passSchema = z.object({ userId: z.string().trim().max(40), hours: z.number().int().min(0).max(720) });

/** Let a member go live for so many hours (0 takes it back). Owner and admins. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { userId, hours } = await readJson(req, passSchema);
  return setLivePass(viewer, params.slug, userId, hours);
});
