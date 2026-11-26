import { NextResponse } from "next/server";
import { appUrl } from "@/server/env";
import { withApi } from "@/server/http/api";
import { twitchCallback } from "@/server/services/twitch.service";

/** Twitch sends them back here after "Connect Twitch": keep the connection, then back to where they came from. */
export const GET = withApi({ auth: "none", limit: { name: "twitch-callback", max: 30, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const to = (back: string, params: Record<string, string>) => {
    const [path, hash] = back.split("#");
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}${new URLSearchParams(params)}${hash ? `#${hash}` : ""}`;
    return NextResponse.redirect(back.startsWith("klique://") ? url : `${appUrl()}${url}`);
  };
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return NextResponse.redirect(`${appUrl()}/settings?twitch=failed#connections`);
  try {
    const { back } = await twitchCallback(code, state);
    return to(back, { twitch: "connected" });
  } catch (err) {
    console.warn("[twitch] connect failed:", (err as Error)?.message);
    return NextResponse.redirect(`${appUrl()}/settings?twitch=failed#connections`);
  }
});
