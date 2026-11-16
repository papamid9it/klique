import { withApi } from "@/server/http/api";
import { donationsOn, webPaymentsOn } from "@/server/services/payments-setting";

/** Public: can people pay on the website right now, and give to communities? (Admin → System switches it.) */
export const GET = withApi({ auth: "none" }, async () => ({ web: await webPaymentsOn(), donations: await donationsOn() }));
