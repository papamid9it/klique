/**
 * Server-side configuration. Read lazily so a missing value produces a clear
 * API error at request time instead of crashing the build.
 */
import { ApiError } from "./http/errors";

export function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new ApiError(503, "The database is not configured yet. Set MONGODB_URI (see .env.example).", {
      code: "db_not_configured",
    });
  }
  return uri;
}

export function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(
      503,
      "Authentication is not configured yet. Set AUTH_SECRET to at least 32 random characters (see .env.example).",
      { code: "auth_not_configured" },
    );
  }
  return new TextEncoder().encode(secret);
}

export const sessionDays = () => {
  const n = Number(process.env.SESSION_DAYS ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
};

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const allowedOrigins = (): string[] =>
  [appUrl(), ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

export const isProd = () => process.env.NODE_ENV === "production";

/* ----------------------------- Cloudinary ---------------------------- */

export type { UploadKind } from "@/lib/uploads";

/**
 * Cloudflare R2, where every uploaded picture and video is stored (resized and compressed on the device first).
 * Null until all five values are set; uploads stay off and people can paste picture links instead.
 */
export function r2Config(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  return accountId && accessKeyId && secretAccessKey && bucket && publicUrl ? { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } : null;
}

/** Realtime pings (Ably). Null until ABLY_API_KEY is set; the app then falls back to polling. */
export const ablyKey = (): string | null => process.env.ABLY_API_KEY?.trim() || null;

/** Voice rooms (LiveKit). Null until the three values are set. */
export function livekitConfig(): { url: string; apiKey: string; apiSecret: string } | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

/* ------------------------------- Email (SMTP) ------------------------------ */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Outgoing email through any SMTP service (Brevo, Resend, Gmail app password, Mailgun…).
 * Null until SMTP_HOST and MAIL_FROM are set; emails are then printed to the server console instead of sent,
 * and email verification is not enforced (so nobody gets locked out of a half-configured install).
 */
export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return { host, port: Number.isFinite(port) ? port : 587, user: process.env.SMTP_USER?.trim() ?? "", pass: process.env.SMTP_PASS ?? "", from };
}

/* ------------------------------ Google sign-in ----------------------------- */

/** "Continue with Google". Null until both values from the Google Cloud console are set. */
export function googleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Where the mobile app may be sent back to after "Continue with Google". Only these exact addresses are
 * accepted (never anything from the request), so a login code can't be steered to someone else's app.
 * Add Expo Go's address (shown by `expo start`, like exp://192.168.1.5:8081/--/auth) while developing.
 */
export const nativeRedirects = (): string[] => ["klique://auth", ...(process.env.NATIVE_REDIRECT_URIS ?? "").split(",")].map((s) => s.trim()).filter(Boolean);

/* ------------------------------ Push notifications ----------------------------- */

/** Optional: only needed if you turn on "enhanced push security" in your Expo account. */
export const expoAccessToken = (): string | null => process.env.EXPO_ACCESS_TOKEN?.trim() || null;
/** Shared secret for the reminder cron (`/api/cron/reminders`). Without it the endpoint refuses everyone. */
export const cronSecret = (): string | null => process.env.CRON_SECRET?.trim() || null;

/** Site admins: these emails can open /admin, review reports and post public events. */
export const adminEmails = (): Set<string> =>
  new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

/** Owners of a community at least this big may post public events (not tied to a community). */
export const eventHostMinMembers = (): number => {
  const n = Number(process.env.EVENT_HOST_MIN_MEMBERS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
};

/**
 * Browser notifications (desktop and phone browsers, and klique installed as an app). Generate a key pair once
 * with `npx web-push generate-vapid-keys` and keep it: changing it cuts off everyone who already said yes.
 */
export function webPushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ? `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL.trim()}` : appUrl());
  return { publicKey, privateKey, subject };
}

/** Paystack, for hosts paying to promote their events. Null until PAYSTACK_SECRET_KEY is set. */
export function paystackConfig(): { secretKey: string; baseUrl: string } | null {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return { secretKey, baseUrl: (process.env.PAYSTACK_API_URL?.trim() || "https://api.paystack.co").replace(/\/$/, "") };
}

/** Promotion pricing: naira per day for a city; wider reach multiplies it. */
export const promotionPricePerDay = (): number => {
  const n = Number(process.env.PROMOTION_PRICE_PER_DAY);
  return Number.isFinite(n) && n >= 100 ? Math.round(n) : 1500;
};

/** "1" = paid promotions wait for an admin to approve them before they show. */
export const promotionReview = (): boolean => process.env.PROMOTION_REVIEW === "1";
