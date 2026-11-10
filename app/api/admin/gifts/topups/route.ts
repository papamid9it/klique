import { withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminStuckTopups, retryStuckTopups } from "@/server/services/gifts.service";

/** Hype top-ups that may be paid without their Hype yet. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  return adminStuckTopups();
});

/** Check them again now and credit the ones that were paid. */
export const POST = withApi({ auth: "required" }, async ({ viewer }) => {
  assertAdmin(viewer);
  const result = await retryStuckTopups();
  return { ...result, stuck: await adminStuckTopups() };
});
