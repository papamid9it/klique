import { withApi } from "@/server/http/api";
import { confirmAdult } from "@/server/services/users.service";

/** "I'm 18 or older", once (before first entering an 18+ community). */
export const POST = withApi({ auth: "required" }, async ({ viewer }) => confirmAdult(viewer));
