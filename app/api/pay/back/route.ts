import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/server/env";
import { payBackPath } from "@/server/services/pay";

/**
 * Coming back from Flutterwave or OPay: send them to the page the payment was for, where it's checked with the
 * company itself (Flutterwave adds ?tx_ref=…, OPay comes back with the ?reference=… we gave it).
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const path = payBackPath(sp.get("tx_ref") ?? sp.get("reference") ?? "") ?? "/settings?tab=plan";
  return NextResponse.redirect(new URL(path, appUrl()));
}
