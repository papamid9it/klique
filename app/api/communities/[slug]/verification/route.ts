import { created, withApi } from "@/server/http/api";
import { applyForVerification, getVerification } from "@/server/services/verification.service";

/** Where this community stands on the Verified check (its owner). */
export const GET = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ params, viewer }) => getVerification(viewer, params.slug));

/** Its owner applies. A site admin then checks the community by hand. */
export const POST = withApi<{ slug: string }, "required">({ auth: "required", limit: { name: "verification", max: 10, windowMs: 60 * 60_000 } }, async ({ params, viewer }) => created(await applyForVerification(viewer, params.slug)));
