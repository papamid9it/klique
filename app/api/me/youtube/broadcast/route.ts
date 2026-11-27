import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { youtubeBroadcast } from "@/server/services/youtube.service";

const schema = z.object({ title: z.string().trim().max(120).default("") });

/** A live broadcast ready on your YouTube channel, and where the camera streams to (only for you; never cached). */
export const POST = withApi({ auth: "required", limit: { name: "youtube-broadcast", max: 10, windowMs: 60 * 60_000 } }, async ({ req, viewer }) => youtubeBroadcast(viewer, (await readJson(req, schema)).title));
