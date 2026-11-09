import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { connectDb } from "@/server/db";
import { cronSecret } from "@/server/env";
import { monthlyGiftPayouts } from "@/server/services/gifts.service";

/**
 * Gift payouts, on the 3rd of each month (vercel.json): every gift-earnings payout requested by the end of last month
 * is listed for admins in Admin, Payouts, and its owner hears it's being paid. Running it twice lists nothing twice.
 * Pass the CRON_SECRET as `Authorization: Bearer <secret>`.
 */
function authorised(req: NextRequest) {
  const secret = cronSecret();
  if (!secret) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ success: false, message: "Not allowed." }, { status: 401 });
  await connectDb();
  return NextResponse.json({ success: true, ...(await monthlyGiftPayouts()) });
}
