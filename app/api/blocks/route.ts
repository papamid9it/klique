import { withApi } from "@/server/http/api";
import { listBlocked } from "@/server/services/safety.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => listBlocked(viewer));
