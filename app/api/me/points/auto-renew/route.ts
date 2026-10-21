import { readJson, withApi } from "@/server/http/api";
import { setAutoRenew } from "@/server/services/points.service";
import { autoRenewSchema } from "@/server/validators/schemas";

/** Turn renewing from your balance on or off for one design. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { key, autoRenew } = await readJson(req, autoRenewSchema);
  return setAutoRenew(viewer, key, autoRenew);
});
