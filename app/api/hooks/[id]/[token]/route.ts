import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { connectDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { runWebhook, webhookRunSchema } from "@/server/services/webhooks.service";

/**
 * A channel webhook: outside tools POST JSON here to post into the channel (Discord-style):
 *   curl -X POST -H "Content-Type: application/json" -d '{"content":"Hello"}' https://your-site/api/hooks/<id>/<secret>
 * Body: { content? (up to 2000 characters), cards? (lib/cards; at least one of the two), username? (shown instead of the webhook's name), avatar_url? (one of our uploads) }.
 * Not a normal app endpoint: no sign-in or browser origin check, the secret in the link is the key.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await ctx.params;
  try {
    const raw = await req.text();
    if (raw.length > 32_000) return NextResponse.json({ success: false, message: "That's too big." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return NextResponse.json({ success: false, message: "Send JSON, like {\"content\":\"Hello\"}." }, { status: 400 });
    }
    await connectDb();
    const out = await runWebhook(id, token, webhookRunSchema.parse(body));
    return NextResponse.json({ success: true, data: out }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ success: false, message: err.issues[0]?.message ?? "That isn't valid." }, { status: 400 });
    console.error("[hooks] failed:", (err as Error).message);
    return NextResponse.json({ success: false, message: "Something went wrong." }, { status: 500 });
  }
}
