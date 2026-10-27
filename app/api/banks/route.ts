import { withApi } from "@/server/http/api";
import { listBanks } from "@/server/services/money.service";

/** Nigerian banks, for the payout form. */
export const GET = withApi({ auth: "required" }, async () => listBanks());
