import { withApi } from "@/server/http/api";
import { markCommunityRead } from "@/server/services/channels.service";
import { resolveSpaceFor } from "@/server/services/spaces.service";

/** Mark as read: everything you can see in the community and its groups. */
export const POST = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return markCommunityRead(viewer, space, access);
});
