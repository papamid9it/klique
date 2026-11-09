import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { getEarnings } from "@/server/services/gifts.service";

const query = z.object({ before: z.string().datetime().optional() });

/** Settings → Earnings: what your gifts earned, on hold, available, asked for and paid, and the gift history. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => getEarnings(viewer, readQuery(req, query).before));
