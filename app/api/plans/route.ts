import { withApi } from "@/server/http/api";
import { paystackConfig } from "@/server/env";
import { getPlanConfig } from "@/server/services/subscriptions.service";

/** The plans on offer (prices and limits from Admin → Plans), for the public pricing page. */
export const GET = withApi({ auth: "optional" }, async () => ({ config: await getPlanConfig(), canBuy: !!paystackConfig() }));
