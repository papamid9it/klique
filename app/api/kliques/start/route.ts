import { withApi } from "@/server/http/api";
import { kliqueStartInfo } from "@/server/services/crews.service";

/** Before the "Start a klique" form: whether you can, Women only, and the communities you could use. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => kliqueStartInfo(viewer));
