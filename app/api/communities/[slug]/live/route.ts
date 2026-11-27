import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { endLive, startLive } from "@/server/services/live.service";

type P = { slug: string };

const startSchema = z.object({
  provider: z.enum(["twitch", "youtube"]),
  link: z.string().trim().max(300).optional(),
  /** a broadcast Klique made on their YouTube channel (Connect YouTube, the phone's camera) */
  broadcastId: z.string().trim().regex(/^[A-Za-z0-9_-]{6,40}$/).optional(),
  title: z.string().trim().max(120).default(""),
  eventId: z.string().trim().max(40).nullish(),
});

/** Go live: on Twitch (connected; LIVE once Twitch says the stream started) or with a YouTube link (live at once). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => startLive(viewer, params.slug, await readJson(req, startSchema)));

/** End the stream: its host, or the people who run the community. */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => endLive(viewer, params.slug));
