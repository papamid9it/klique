import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { giftsSent } from "@/server/services/gifts.service";

const query = z.object({ before: z.string().datetime().optional() });

/** Gifts you sent (anonymous ones included: only you and site admins know they were yours). */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => giftsSent(viewer, readQuery(req, query).before));
