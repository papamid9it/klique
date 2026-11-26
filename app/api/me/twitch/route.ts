import { withApi } from "@/server/http/api";
import { twitchDisconnect, twitchStatus } from "@/server/services/twitch.service";

/** Your Twitch connection (no secrets). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => twitchStatus(viewer));

/** Disconnect Twitch. */
export const DELETE = withApi({ auth: "required" }, async ({ viewer }) => twitchDisconnect(viewer._id));
