import { withApi } from "@/server/http/api";
import { listRequests } from "@/server/services/messaging.service";

/** Message requests sent to you (people you don't chat with freely): accept, delete or block each. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => listRequests(viewer));
