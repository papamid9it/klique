import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/server/db";
import { handlePaystackWebhook } from "@/server/services/promotions.service";

/**
 * Paystack's payment notifications (Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL:
 * https://your-site/api/webhooks/paystack). Signed with your secret key; anything unsigned is refused.
 * This makes a promotion go live even if the host closes the tab before coming back.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false }, { status: 413 });
  await connectDb();
  try {
    const ok = await handlePaystackWebhook(raw, req.headers.get("x-paystack-signature"));
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch (err) {
    console.error("[paystack] webhook failed:", (err as Error).message);
    // a 5xx makes Paystack retry later
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
