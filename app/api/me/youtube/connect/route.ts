import { withApi } from "@/server/http/api";
import { youtubeConnectUrl } from "@/server/services/youtube.service";

/** Where "Connect YouTube" goes: Google's sign-in, asking for YouTube live access only. Returned so the app can open it. */
export const GET = withApi({ auth: "required", limit: { name: "youtube-connect", max: 20, windowMs: 15 * 60_000 } }, async ({ req, viewer }) => ({
  url: await youtubeConnectUrl(viewer, req.nextUrl.searchParams.get("back") ?? "/settings#connections"),
}));
