import { NextResponse } from "next/server";
import { appUrl } from "@/server/env";
import { withApi } from "@/server/http/api";
import { youtubeCallback } from "@/server/services/youtube.service";

/** Google sends them back here after "Connect YouTube": keep the connection, then back to where they came from. */
export const GET = withApi({ auth: "none", limit: { name: "youtube-callback", max: 30, windowMs: 15 * 60_000 } }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const to = (back: string, params: Record<string, string>) => {
    const [path, hash] = back.split("#");
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}${new URLSearchParams(params)}${hash ? `#${hash}` : ""}`;
    return NextResponse.redirect(back.startsWith("klique://") ? url : `${appUrl()}${url}`);
  };
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return NextResponse.redirect(`${appUrl()}/settings?youtube=failed#connections`);
  try {
    const { back } = await youtubeCallback(code, state);
    return to(back, { youtube: "connected" });
  } catch (err) {
    console.warn("[youtube] connect failed:", (err as Error)?.message);
    return NextResponse.redirect(`${appUrl()}/settings?youtube=failed#connections`);
  }
});
