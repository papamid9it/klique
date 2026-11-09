import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { getGiftWallet } from "@/server/services/gifts.service";

const query = z.object({ before: z.string().datetime().optional() });

/** Your Hype for gifts: balance, top-up options and history (`?before=` for older history). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => getGiftWallet(viewer, readQuery(req, query).before));
