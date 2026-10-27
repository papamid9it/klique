import { readJson, withApi } from "@/server/http/api";
import { buyPack } from "@/server/services/wallet.service";
import { buyHypeSchema } from "@/server/validators/schemas";

/** Start paying for a Hype pack on Paystack. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => buyPack(viewer, (await readJson(req, buyHypeSchema)).packId));
