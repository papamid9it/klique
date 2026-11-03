import { z } from "zod";
import { readQuery, withApi } from "@/server/http/api";
import { pickerEmoji } from "@/server/services/emoji.service";

const query = z.object({ community: z.string().max(80).optional() });

/** The emoji picker: this community's emoji, and (Pro) every other community's you're in. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => pickerEmoji(viewer, readQuery(req, query).community));
