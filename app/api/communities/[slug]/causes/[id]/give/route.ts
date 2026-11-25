import { readJson, withApi } from "@/server/http/api";
import { giveToCause } from "@/server/services/causes.service";
import { causeGiveSchema } from "@/server/validators/schemas";

type P = { slug: string; id: string };

/** Give Hype to a cause: a gift, never refunded (402 not_enough_hype when short). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => giveToCause(viewer, params.slug, params.id, await readJson(req, causeGiveSchema)));
