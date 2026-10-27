import { withApi } from "@/server/http/api";
import { communityMoney } from "@/server/services/money.service";

type P = { slug: string };

/** The community's balance, donation buttons, recent payments and payouts (owners and admins). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => communityMoney(viewer, params.slug));
