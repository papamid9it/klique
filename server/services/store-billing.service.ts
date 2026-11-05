import "server-only";
import { createHash } from "node:crypto";
import { decodeJwt, importPKCS8, SignJWT } from "jose";
import { ApiError, badRequest } from "../http/errors";

/**
 * Checking a purchase made in the phone app, with Apple or Google directly: the phone only says which purchase it
 * made, and nothing it says about the purchase is believed. Needs these on the server (none of them go in the app):
 *  - APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY: an App Store Connect API key (In-App Purchase role)
 *  - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: a service account with access to the app in Play Console
 *  - STORE_IAP_ALLOW_TEST=1: also accept sandbox and test purchases, which cost nothing. For test builds and App
 *    Review only: while it's on, anyone with a test account gets ads for free.
 */

const APP_ID = "app.getklique.mobile";
const APPLE_LIVE = "https://api.storekit.itunes.apple.com";
const APPLE_SANDBOX = "https://api.storekit-sandbox.itunes.apple.com";

export type StoreSale = { id: string; productId: string; accountToken: string | null; test: boolean; refunded: boolean; pending: boolean };

const allowTest = () => process.env.STORE_IAP_ALLOW_TEST === "1";
const key = (v: string | undefined) => (v ?? "").replace(/\\n/g, "\n");

export const storeBillingStatus = () => ({
  apple: !!(process.env.APPLE_IAP_ISSUER_ID && process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_PRIVATE_KEY),
  google: !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
});

/** Ties a store purchase to one ad. A UUID, because that's the only shape Apple accepts. */
export function storeAccountToken(campaignId: string): string {
  const h = createHash("sha256").update(`klique-ad:${campaignId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* ------------------------------- Apple ------------------------------- */

async function appleToken(): Promise<string> {
  const pk = await importPKCS8(key(process.env.APPLE_IAP_PRIVATE_KEY), "ES256");
  return new SignJWT({ bid: APP_ID })
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_IAP_KEY_ID!, typ: "JWT" })
    .setIssuer(process.env.APPLE_IAP_ISSUER_ID!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience("appstoreconnect-v1")
    .sign(pk);
}

export async function appleSale(transactionId: string): Promise<StoreSale> {
  if (!storeBillingStatus().apple) throw badRequest("Paying with Apple isn't set up yet.");
  const token = await appleToken();
  const ask = (base: string) => fetch(`${base}/inApp/v1/transactions/${encodeURIComponent(transactionId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  let res = await ask(APPLE_LIVE);
  let test = false;
  // not a live purchase: Apple's advice is to try the sandbox next, which only counts if test purchases are allowed
  if (res.status === 404 && allowTest()) {
    res = await ask(APPLE_SANDBOX);
    test = true;
  }
  if (res.status === 404) throw new ApiError(402, "Apple doesn't know that purchase.", { code: "store_unknown" });
  if (!res.ok) throw new ApiError(503, "We couldn't reach Apple. Your payment is safe: try again in a minute.");
  // this came straight from Apple over HTTPS, so reading it is enough
  const t = decodeJwt(((await res.json()) as { signedTransactionInfo: string }).signedTransactionInfo) as { transactionId: string; productId: string; bundleId: string; appAccountToken?: string; type: string; revocationDate?: number };
  if (t.bundleId !== APP_ID || t.type !== "Consumable") throw new ApiError(402, "That purchase isn't for this app.", { code: "store_unknown" });
  return { id: t.transactionId, productId: t.productId, accountToken: t.appAccountToken ?? null, test, refunded: !!t.revocationDate, pending: false };
}

/* ------------------------------- Google ------------------------------ */

async function googleAccess(): Promise<string> {
  const account = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!) as { client_email: string; private_key: string };
  const pk = await importPKCS8(key(account.private_key), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(pk);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(503, "We couldn't reach Google. Your payment is safe: try again in a minute.");
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function googleSale(productId: string, purchaseToken: string): Promise<StoreSale> {
  if (!storeBillingStatus().google) throw badRequest("Paying with Google isn't set up yet.");
  const access = await googleAccess();
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
  if (res.status === 404 || res.status === 400) throw new ApiError(402, "Google doesn't know that purchase.", { code: "store_unknown" });
  if (!res.ok) throw new ApiError(503, "We couldn't reach Google. Your payment is safe: try again in a minute.");
  // purchaseState: 0 bought, 1 cancelled, 2 waiting (paying by cash at a shop); purchaseType 0 is a test purchase
  const p = (await res.json()) as { orderId?: string; purchaseState?: number; purchaseType?: number; obfuscatedExternalAccountId?: string };
  return { id: p.orderId ?? createHash("sha256").update(purchaseToken).digest("hex"), productId, accountToken: p.obfuscatedExternalAccountId ?? null, test: p.purchaseType === 0, refunded: p.purchaseState === 1, pending: p.purchaseState === 2 };
}

export const testSalesAllowed = allowTest;
