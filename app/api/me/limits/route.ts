import { withApi } from "@/server/http/api";
import { limitsFor } from "@/server/services/limits.service";

/** What you may still do on your plan (plus any extra the Klique Team gave you): kliques and communities. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => limitsFor(viewer));
