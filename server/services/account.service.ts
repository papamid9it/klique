import { createHash, randomBytes } from "node:crypto";
import type { z } from "zod";
import { appUrl } from "../env";
import { passwordChangedMail, resetPasswordMail, verifyEmailMail } from "../emails";
import { ApiError } from "../http/errors";
import { rateLimitShared } from "../http/rate-limit";
import { mailerConfigured, queueMail } from "../mailer";
import { hashPassword, verifyPassword } from "../auth/password";
import { signSession } from "../auth/session";
import { AuthToken, type TokenKind } from "../models/AuthToken";
import { User, type IUser } from "../models/User";
import { assertNotSuspended } from "../policies/account";
import { toMe } from "../serializers";
import { unreadTotal } from "./messaging.service";
import type { changePasswordSchema } from "../validators/schemas";
import type { AuthResult } from "./auth.service";

const TTL: Record<TokenKind, number> = { verify: 24 * 60 * 60_000, reset: 60 * 60_000, app: 2 * 60_000 };
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** A fresh single-use token for this person; any older one of the same kind stops working. */
async function issue(userId: IUser["_id"], kind: TokenKind): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await AuthToken.deleteMany({ userId, kind });
  await AuthToken.create({ userId, kind, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL[kind]) });
  return token;
}

const badLink = () => new ApiError(400, "This link is invalid or has expired. Request a new one and try again.", { code: "bad_token" });

/** Look up a token without consuming it. */
async function peek(token: string, kind: TokenKind) {
  const row = await AuthToken.findOne({ tokenHash: sha(token), kind, expiresAt: { $gt: new Date() } }).lean();
  if (!row) throw badLink();
  return row;
}

/* ------------------------------ verify email ------------------------------ */

export async function sendVerification(user: Pick<IUser, "_id" | "email" | "displayName" | "emailVerifiedAt">, opts: { throttle?: boolean } = {}) {
  if (user.emailVerifiedAt) return;
  if (opts.throttle) await rateLimitShared(`verify-mail:${String(user._id)}`, 3, 10 * 60_000);
  const token = await issue(user._id, "verify");
  queueMail(verifyEmailMail(user.email, user.displayName, `${appUrl()}/verify-email?token=${token}`));
}

export async function verifyEmail(token: string): Promise<{ verified: true }> {
  const row = await peek(token, "verify");
  await User.updateOne({ _id: row.userId, emailVerifiedAt: null }, { emailVerifiedAt: new Date() });
  await AuthToken.deleteMany({ userId: row.userId, kind: "verify" });
  return { verified: true };
}

/** Until emails really go out, nobody is blocked for being unverified. */
export function assertVerified(viewer: Pick<IUser, "emailVerifiedAt">) {
  if (mailerConfigured() && !viewer.emailVerifiedAt) {
    throw new ApiError(403, "Confirm your email address first. We sent you a link, and you can ask for another in Settings.", { code: "email_unverified" });
  }
}

/* ----------------------------- forgot / reset ----------------------------- */

/** Always answers the same way, so nobody can use this form to find out who has an account. */
export async function forgotPassword(email: string): Promise<{ sent: true }> {
  await rateLimitShared(`forgot:${email}`, 3, 60 * 60_000);
  const user = await User.findOne({ email }).lean<IUser>();
  if (user) {
    const token = await issue(user._id, "reset");
    queueMail(resetPasswordMail(user.email, user.displayName, `${appUrl()}/reset-password?token=${token}`));
  }
  return { sent: true };
}

/** Lets the reset page say "this link is dead" before the person types a password. */
export async function checkResetToken(token: string): Promise<{ valid: true }> {
  await peek(token, "reset");
  return { valid: true };
}

export async function resetPassword(token: string, password: string): Promise<{ reset: true }> {
  const row = await peek(token, "reset");
  const user = await User.findByIdAndUpdate(
    row.userId,
    {
      passwordHash: await hashPassword(password),
      hasPassword: true,
      $inc: { tokenVersion: 1 }, // every device signs in again
    },
    { returnDocument: "after" },
  ).lean<IUser>();
  if (!user) throw badLink();
  // They received this link at their inbox, so the address is theirs.
  if (!user.emailVerifiedAt) await User.updateOne({ _id: user._id }, { emailVerifiedAt: new Date() });
  await AuthToken.deleteMany({ userId: user._id });
  queueMail(passwordChangedMail(user.email, user.displayName));
  return { reset: true };
}

/* ----------------------------- change password ----------------------------- */

export async function changePassword(viewer: IUser, input: z.infer<typeof changePasswordSchema>): Promise<AuthResult> {
  await rateLimitShared(`change-pw:${String(viewer._id)}`, 8, 15 * 60_000);
  const full = await User.findById(viewer._id).select("+passwordHash").lean<IUser>();
  if (!full) throw new ApiError(401, "Please sign in again.");

  if (full.passwordHash) {
    if (!input.currentPassword) throw new ApiError(422, "Enter your current password.", { errors: { currentPassword: "Enter your current password." }, code: "validation_failed" });
    if (!(await verifyPassword(input.currentPassword, full.passwordHash))) {
      throw new ApiError(422, "That isn't your current password.", { errors: { currentPassword: "That isn't your current password." }, code: "validation_failed" });
    }
    if (input.currentPassword === input.newPassword) {
      throw new ApiError(422, "Choose a password you haven't used just now.", { errors: { newPassword: "Choose a different password." }, code: "validation_failed" });
    }
  }

  const updated = await User.findByIdAndUpdate(
    viewer._id,
    { passwordHash: await hashPassword(input.newPassword), hasPassword: true, $inc: { tokenVersion: 1 } },
    { returnDocument: "after" },
  ).lean<IUser>();
  if (!updated) throw new ApiError(401, "Please sign in again.");
  queueMail(passwordChangedMail(updated.email, updated.displayName));
  // Other devices are signed out by the version bump; this one gets a fresh token.
  return { user: toMe(updated, await unreadTotal(updated._id)), token: await signSession(String(updated._id), updated.tokenVersion) };
}

/* ------------------------- mobile app sign-in codes ------------------------ */

/**
 * After Google sign-in the browser hands the app a short-lived, single-use code (not a session). The app trades it
 * for a session together with the secret `verifier` only it knows (PKCE), so a code intercepted on the way is useless.
 */
export async function issueAppCode(userId: IUser["_id"], challenge: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await AuthToken.create({ userId, kind: "app", tokenHash: sha(code), meta: challenge, expiresAt: new Date(Date.now() + TTL.app) });
  return code;
}

export async function exchangeAppCode(code: string, verifier: string): Promise<AuthResult> {
  const row = await AuthToken.findOneAndDelete({ tokenHash: sha(code), kind: "app", expiresAt: { $gt: new Date() } }).lean();
  if (!row || !row.meta || sha(verifier) !== row.meta) throw badLink();
  const user = await User.findById(row.userId).lean<IUser>();
  if (!user) throw badLink();
  assertNotSuspended(user);
  return { user: toMe(user, await unreadTotal(user._id)), token: await signSession(String(user._id), user.tokenVersion) };
}
