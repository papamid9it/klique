import { ApiError } from "../http/errors";
import type { IUser } from "../models/User";

/** Suspended accounts (set from /admin) can't start a new session by any route. */
export function assertNotSuspended(user: Pick<IUser, "suspendedAt">) {
  if (user.suspendedAt) throw new ApiError(403, "This account has been suspended. Contact support if you think that's a mistake.", { code: "suspended" });
}
