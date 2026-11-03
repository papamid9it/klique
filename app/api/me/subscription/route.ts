import { withApi } from "@/server/http/api";
import { mySubscription } from "@/server/services/subscriptions.service";

/** Your plan (Free, Lite or Pro), until when, whether it renews, the plans on offer and what you've used. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => mySubscription(viewer));
