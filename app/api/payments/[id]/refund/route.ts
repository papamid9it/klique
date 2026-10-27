import { withApi } from "@/server/http/api";
import { refundContribution } from "@/server/services/money.service";

type P = { id: string };

/** Refund a contribution, minus Klique's fee, before it's paid out. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => refundContribution(viewer, params.id));
