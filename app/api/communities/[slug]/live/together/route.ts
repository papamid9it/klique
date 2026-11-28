import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { liveTogether, togetherCandidates } from "@/server/services/live-together.service";

const id = z.string().trim().max(40);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["invite", "cancel", "remove", "main"]), userId: id }),
  z.object({ action: z.enum(["accept", "decline", "leave"]) }),
  z.object({ action: z.literal("join"), provider: z.enum(["twitch", "youtube"]), broadcastId: z.string().trim().max(64).optional(), link: z.string().trim().max(300).optional() }),
]);

/** Live together: invite people to stream with you (and take them off), say yes or no, join with your camera, leave. */
export const POST = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => liveTogether(viewer, params.slug, await readJson(req, schema)));

/** Who the host can ask to join (members, with whether they can stream). */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => togetherCandidates(viewer, params.slug, req.nextUrl.searchParams.get("q") ?? ""));
