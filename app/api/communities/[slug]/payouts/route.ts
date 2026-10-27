import { readJson, withApi } from "@/server/http/api";
import { requestPayout } from "@/server/services/money.service";
import { payoutRequestSchema } from "@/server/validators/schemas";

type P = { slug: string };

/** The owner asks for the balance to be paid to a bank account. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => requestPayout(viewer, params.slug, await readJson(req, payoutRequestSchema)));
