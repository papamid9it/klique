import { withApi } from "@/server/http/api";
import { sendVerification } from "@/server/services/account.service";

export const POST = withApi({ auth: "required", limit: { name: "verify-resend", max: 10, windowMs: 60 * 60_000 } }, async ({ viewer }) => {
  await sendVerification(viewer, { throttle: true });
  return { sent: true, alreadyVerified: !!viewer.emailVerifiedAt };
});
