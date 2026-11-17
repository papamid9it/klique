import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/server/db";
import { flutterwaveWebhookOk } from "@/server/services/pay";
import { settlePayment } from "@/server/services/settle";

/**
 * Flutterwave's payment notifications (Flutterwave dashboard → Settings → Webhooks: URL
 * https://www.getklique.app/api/webhooks/flutterwave, and the same "Secret hash" as FLUTTERWAVE_WEBHOOK_HASH).
 * Anything without that hash is refused, and even then the payment is checked with Flutterwave before anything is given.
 */
export async function POST(req: NextRequest) {
  if (!flutterwaveWebhookOk(req.headers.get("verif-hash"))) return NextResponse.json({ ok: false }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: { data?: { tx_ref?: unknown }; txRef?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await connectDb();
  try {
    await settlePayment(body?.data?.tx_ref ?? body?.txRef);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[flutterwave] webhook failed:", (err as Error).message);
    // a 5xx makes Flutterwave retry later
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
