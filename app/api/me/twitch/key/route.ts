import { withApi } from "@/server/http/api";
import { twitchStreamKey } from "@/server/services/twitch.service";

/** Where to stream (OBS, or the app's camera): Twitch's server and your stream key. Only for you; never cached. */
export const GET = withApi({ auth: "required", limit: { name: "twitch-key", max: 30, windowMs: 15 * 60_000 } }, async ({ viewer }) => twitchStreamKey(viewer));
