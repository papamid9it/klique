import { joinKlique } from "./klique.service";
import type { z } from "zod";
import { ApiError } from "../http/errors";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password";
import { signSession } from "../auth/session";
import { User, type IUser } from "../models/User";
import { assertNotSuspended } from "../policies/account";
import type { loginSchema, signupSchema } from "../validators/schemas";
import { toMe } from "../serializers";
import { assertPlace } from "./helpers";
import { sendVerification } from "./account.service";
import { unreadTotal } from "./messaging.service";
import type { UserMe } from "@/lib/types";

export interface AuthResult {
  user: UserMe;
  /** For native/desktop clients: send as `Authorization: Bearer <token>`. Web uses the cookie. */
  token: string;
}

export async function signup(input: z.infer<typeof signupSchema>): Promise<AuthResult & { _id: string }> {
  const [emailTaken, handleTaken] = await Promise.all([
    User.exists({ email: input.email }),
    User.exists({ handle: input.handle }),
  ]);
  assertPlace(input, true);
  const errors: Record<string, string> = {};
  if (emailTaken) errors.email = "An account with that email already exists.";
  if (handleTaken) errors.handle = "That handle is already taken.";
  if (Object.keys(errors).length) throw new ApiError(409, Object.values(errors)[0], { errors, code: "duplicate" });

  const user = await User.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    handle: input.handle,
    country: input.country,
    region: input.region,
    city: input.city,
  });
  const lean = user.toObject() as IUser;
  await joinKlique(user._id); // everyone's in Klique, from the start
  await sendVerification(lean);
  return { _id: String(user._id), user: toMe(lean, 0), token: await signSession(String(user._id), user.tokenVersion) };
}

export async function login(input: z.infer<typeof loginSchema>): Promise<AuthResult & { _id: string }> {
  const user = await User.findOne({ email: input.email }).select("+passwordHash").lean<IUser>();

  if (user && !user.passwordHash) {
    throw new ApiError(401, "This account signs in with Google. Use \"Continue with Google\", or choose \"Forgot your password?\" to set a password.", { code: "use_google" });
  }

  // Always run one bcrypt comparison so timing doesn't reveal whether the email exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) throw new ApiError(401, "That email and password don't match.", { code: "bad_credentials" });
  assertNotSuspended(user);

  return {
    _id: String(user._id),
    user: toMe(user, await unreadTotal(user._id)),
    token: await signSession(String(user._id), user.tokenVersion),
  };
}

/** Invalidate every token issued to this user (used by "sign out everywhere"). */
export async function revokeAllSessions(userId: string) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
