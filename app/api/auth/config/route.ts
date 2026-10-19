import { googleConfig } from "@/server/env";
import { withApi } from "@/server/http/api";
import { mailerConfigured } from "@/server/mailer";
import type { AuthConfigDTO } from "@/lib/types";

/** Which sign-in options this server has switched on (the pages hide what isn't available). */
export const GET = withApi({ auth: "none" }, async (): Promise<AuthConfigDTO> => ({ google: googleConfig() !== null, emailVerification: mailerConfigured() }));
