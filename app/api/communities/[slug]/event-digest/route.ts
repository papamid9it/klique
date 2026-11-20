import { readJson, withApi } from "@/server/http/api";
import { eventDigestSchema, getEventDigest, setEventDigest } from "@/server/services/event-digest.service";

type P = { slug: string };

/** Event reminders: the room where the week's events are posted every Monday morning (null: off). Owners and admins. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => getEventDigest(viewer, params.slug));

export const PUT = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => setEventDigest(viewer, params.slug, await readJson(req, eventDigestSchema)));
