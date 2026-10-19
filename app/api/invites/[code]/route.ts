import { withApi } from "@/server/http/api";
import { acceptInvite, previewInvite } from "@/server/services/spaces.service";

type P = { code: string };

/** What an invite link shows before accepting — name, city, interest. Nothing else. */
export const GET = withApi<P, "optional">({ auth: "optional", limit: { name: "invite-preview", max: 60, windowMs: 60_000 } }, async ({ params, viewer }) =>
  previewInvite(params.code, viewer),
);

export const POST = withApi<P, "required">({ auth: "required", limit: { name: "invite-accept", max: 20, windowMs: 60_000 } }, async ({ params, viewer }) =>
  acceptInvite(params.code, viewer),
);
