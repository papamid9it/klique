import { withApi } from "@/server/http/api";
import { getProfile } from "@/server/services/users.service";

export const GET = withApi<{ handle: string }, "optional">({ auth: "optional" }, async ({ params, viewer }) =>
  getProfile(viewer, params.handle),
);
