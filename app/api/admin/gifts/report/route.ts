import { readQuery, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminGiftsCsv, adminGiftsReport } from "@/server/services/gifts.service";
import { giftReportQuery } from "@/server/validators/schemas";

/** The gifts dashboard (`?from=&to=` dates, `group=day|month`); `csv=purchases|sends` downloads a CSV instead. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const q = readQuery(req, giftReportQuery);
  if (q.csv) {
    const body = await adminGiftsCsv(q.csv, q);
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="klique-gift-${q.csv}-${q.from ?? "all"}-${q.to ?? "now"}.csv"`, "Cache-Control": "no-store" } });
  }
  return adminGiftsReport(q);
});
