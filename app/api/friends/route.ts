import { withApi } from "@/server/http/api";
import { listFriends } from "@/server/services/friends.service";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => listFriends(viewer));
