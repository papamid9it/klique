import { withApi } from "@/server/http/api";
import { getWallet } from "@/server/services/points.service";

/** Your points: balance, unlocked designs, prices, packs on sale and recent history. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => getWallet(viewer));
