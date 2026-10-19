import { withApi } from "@/server/http/api";
import { suggestions } from "@/server/services/friends.service";

export const GET = withApi({ auth: "required", limit: { name: "friend-suggest", max: 30, windowMs: 60_000 } }, async ({ viewer }) => suggestions(viewer));
