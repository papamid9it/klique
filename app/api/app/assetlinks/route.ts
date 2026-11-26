import { NextResponse } from "next/server";
import { ANDROID_PACKAGE } from "@/lib/constants";

/**
 * Android App Links (served at /.well-known/assetlinks.json, next.config rewrites): says the Klique app may open
 * getklique.app links, so a link tapped on a phone with the app opens the app. Android checks the app's signing
 * certificate against these: the SHA-256 fingerprints from Play Console → Test and release → App integrity → App
 * signing (all of them: Play Console's "Copy all certificate fingerprints → SHA-256" pasted as it is), in ANDROID_CERT_SHA256.
 */
export function GET() {
  // whatever was pasted (Play Console's "Copy all SHA-256 fingerprints", its JSON snippet, commas, new lines): every
  // SHA-256 fingerprint in it, once each
  const fingerprints = [...new Set((process.env.ANDROID_CERT_SHA256 ?? "").toUpperCase().match(/\b([0-9A-F]{2}:){31}[0-9A-F]{2}\b/g) ?? [])];
  const body = fingerprints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints } }] : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
