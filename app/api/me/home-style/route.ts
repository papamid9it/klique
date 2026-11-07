import { readJson, withApi } from "@/server/http/api";
import { HomeStyleReport } from "@/server/models/HomeStyleReport";
import { homeStyleSchema } from "@/server/validators/schemas";

/** Which Home style this device uses: the choice stays on the device; this only counts it for the admin overview. */
export const POST = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => {
  const { style, platform } = await readJson(req, homeStyleSchema);
  await HomeStyleReport.updateOne({ userId: viewer._id, platform }, { $set: { style, seenAt: new Date() } }, { upsert: true });
  return { saved: true };
});
