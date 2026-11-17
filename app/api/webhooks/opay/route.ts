import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/server/db";
import { settlePayment } from "@/server/services/settle";

/**
 * OPay's payment notifications. Each checkout tells OPay to call https://www.getklique.app/api/webhooks/opay, so
 * nothing needs setting in its dashboard. The message only says which checkout to look at: the payment is then
 * checked with OPay's own signed status call before anything is given, so a made-up message gets nothing.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: { payload?: { reference?: unknown }; reference?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await connectDb();
  try {
    await settlePayment(body?.payload?.reference ?? body?.reference);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[opay] webhook failed:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
