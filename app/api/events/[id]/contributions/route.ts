import { withApi } from "@/server/http/api";
import { eventContributions } from "@/server/services/money.service";

type P = { id: string };

/** Who has chipped in (the host and the community's owners and admins). */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => eventContributions(viewer, params.id));
