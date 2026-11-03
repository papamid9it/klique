import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { emojiByIds } from "@/server/services/emoji.service";

const query = z.object({ ids: z.string().max(5000).default("") });

/** Custom emoji by id, to show them in messages (missing ones are left out and show as :name:). */
export const GET = withApi({ auth: "optional", publicCache: 300, limit: { name: "emoji", max: 120, windowMs: 60_000 } }, async ({ req }) => emojiByIds(readQuery(req, query).ids.split(",").filter(Boolean)));
