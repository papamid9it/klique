import { withApi } from "@/server/http/api";
import { twitchConnectUrl } from "@/server/services/twitch.service";

/**
 * Where "Connect Twitch" goes: Twitch's sign-in. Returned (not redirected) so the app, which signs in with a token a
 * browser wouldn't carry, can open it too. `back`: a page on Klique, or the app's klique:// link.
 */
export const GET = withApi({ auth: "required", limit: { name: "twitch-connect", max: 20, windowMs: 15 * 60_000 } }, async ({ req, viewer }) => ({
  url: await twitchConnectUrl(viewer, req.nextUrl.searchParams.get("back") ?? "/settings#connections"),
}));
