import { withApi } from "@/server/http/api";
import { cancelSubscription } from "@/server/services/subscriptions.service";

/** Stop renewing; the plan lasts to the end of the month already paid. */
export const POST = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => cancelSubscription(viewer));
