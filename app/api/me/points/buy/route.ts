import { readJson, withApi } from "@/server/http/api";
import { buyPack } from "@/server/services/points.service";
import { buyPointsSchema } from "@/server/validators/schemas";

/** Start paying for a points pack on Paystack. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => buyPack(viewer, (await readJson(req, buyPointsSchema)).packId));
