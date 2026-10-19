import { withApi } from "@/server/http/api";
import { hostingOptions } from "@/server/policies/hosting";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => hostingOptions(viewer));
