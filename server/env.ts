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

/** Which Cloudinary account holds what. Three accounts keep quotas and billing separate. */
export type UploadKind = "avatar" | "photo" | "video";

export interface CloudinaryAccount {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const CLOUDINARY_PREFIX: Record<UploadKind, string> = { avatar: "CLOUDINARY_AVATARS", photo: "CLOUDINARY_PHOTOS", video: "CLOUDINARY_VIDEOS" };

/** The account for an upload kind, or null when it isn't configured (uploads then stay off for that kind). */
export function cloudinaryAccount(kind: UploadKind): CloudinaryAccount | null {
  const p = CLOUDINARY_PREFIX[kind];
  const cloudName = process.env[`${p}_CLOUD_NAME`]?.trim();
  const apiKey = process.env[`${p}_API_KEY`]?.trim();
  const apiSecret = process.env[`${p}_API_SECRET`]?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
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
