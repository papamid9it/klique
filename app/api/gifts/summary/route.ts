import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { giftSummaries } from "@/server/services/gifts.service";

const query = z.object({ targets: z.string().max(4000).default("") });

/** The gifts on several items at once: `?targets=post:<id>,comment:<id>`. Counts only, never who. */
export const GET = withApi({ auth: "optional" }, async ({ req }) => giftSummaries(readQuery(req, query).targets));
