import { memberTimeout } from "@/server/http/space-routes";

/** Time a member out for a while (seconds: 60, 300, 600, 3600, 86400 or 604800), or lift it (seconds: 0). */
export const POST = memberTimeout;
