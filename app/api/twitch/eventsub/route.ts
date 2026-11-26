import type { NextRequest } from "next/server";
import { connectDb } from "@/server/db";
import { onTwitchOffline, onTwitchOnline } from "@/server/services/live.service";
import { verifyEventSub } from "@/server/services/twitch.service";

/**
 * Twitch telling Klique a connected channel went live or off (EventSub webhooks). Checked by its signature; the first
 * call (the challenge) is answered with the challenge itself, as plain text.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyEventSub(req.headers, raw)) return new Response("bad signature", { status: 403 });
  let body: { challenge?: string; subscription?: { type?: string; status?: string }; event?: { broadcaster_user_id?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad body", { status: 400 });
  }
  const kind = req.headers.get("twitch-eventsub-message-type");
  if (kind === "webhook_callback_verification") return new Response(body.challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  if (kind === "revocation") {
    console.warn("[twitch] subscription revoked:", body.subscription?.type, body.subscription?.status);
    return new Response(null, { status: 204 });
  }
  const twitchId = body.event?.broadcaster_user_id;
  if (kind === "notification" && twitchId) {
    await connectDb();
    if (body.subscription?.type === "stream.online") await onTwitchOnline(twitchId);
    else if (body.subscription?.type === "stream.offline") await onTwitchOffline(twitchId);
  }
  return new Response(null, { status: 204 });
}
