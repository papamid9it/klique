import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import type { GithubPayload } from "@/server/services/github-webhook";
import { runGithubWebhook } from "@/server/services/webhooks.service";

/** GitHub's updates can be large, far bigger than the message we make from them. */
const MAX_BYTES = 5 * 1024 * 1024;

/** GitHub sends JSON, or a form with the JSON in `payload`, whichever was picked when the webhook was added. */
function readPayload(raw: string, contentType: string): GithubPayload | null {
  try {
    const json = contentType.includes("application/x-www-form-urlencoded") ? new URLSearchParams(raw).get("payload") : raw;
    const parsed: unknown = JSON.parse(json ?? "");
    return parsed && typeof parsed === "object" ? (parsed as GithubPayload) : null;
  } catch {
    return null;
  }
}

/**
 * The same webhook, for GitHub: paste this link into a repo's Settings → Webhooks and its updates post in the channel.
 * Like the plain link, it has no sign-in or browser origin check: the secret in the link is the key.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await ctx.params;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return NextResponse.json({ success: false, message: "That's too big." }, { status: 413 });
    const payload = readPayload(raw, req.headers.get("content-type") ?? "");
    if (!payload) return NextResponse.json({ success: false, message: "That isn't an update from GitHub." }, { status: 400 });
    await connectDb();
    const out = await runGithubWebhook(id, token, req.headers.get("x-github-event") ?? "", payload);
    return NextResponse.json({ success: true, data: out }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    console.error("[hooks] github failed:", (err as Error).message);
    return NextResponse.json({ success: false, message: "Something went wrong." }, { status: 500 });
  }
}
