import { withApi } from "@/server/http/api";
import { youtubeDisconnect, youtubeStatus } from "@/server/services/youtube.service";

/** Your YouTube connection (no secrets), and whether going live through it is possible today. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => youtubeStatus(viewer));

/** Disconnect YouTube. */
export const DELETE = withApi({ auth: "required" }, async ({ viewer }) => youtubeDisconnect(viewer._id));
