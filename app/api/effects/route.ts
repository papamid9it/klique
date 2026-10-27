import { withApi } from "@/server/http/api";
import { listEffects } from "@/server/services/effects.service";

/** The profile effects people can pick (and that profiles show). */
export const GET = withApi({ auth: "optional" }, async () => listEffects());
