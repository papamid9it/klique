import { connection, NextResponse } from "next/server";

/**
 * For the phone app, checked each time it opens. Below `minVersion` it blocks until updated; below `latestVersion`
 * it offers the update once. Set per platform with environment variables; left unset, every version is allowed.
 * Only raise a minimum once that version is live in the store, or people are blocked with nothing to update to.
 */
const platform = (name: "IOS" | "ANDROID", fallbackStore: string) => ({
  minVersion: process.env[`MOBILE_MIN_VERSION_${name}`]?.trim() || "0.0.0",
  latestVersion: process.env[`MOBILE_LATEST_VERSION_${name}`]?.trim() || "0.0.0",
  storeUrl: process.env[`MOBILE_STORE_URL_${name}`]?.trim() || fallbackStore,
  notes: (process.env.MOBILE_RELEASE_NOTES ?? "").split("|").map((n) => n.trim()).filter(Boolean),
});

export async function GET() {
  await connection();
  return NextResponse.json(
    { success: true, data: { ios: platform("IOS", "https://getklique.app/download"), android: platform("ANDROID", "https://play.google.com/store/apps/details?id=app.getklique.mobile") } },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
