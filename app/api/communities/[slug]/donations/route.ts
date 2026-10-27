import { created, readJson, withApi } from "@/server/http/api";
import { listDonationButtons, saveDonationButton } from "@/server/services/money.service";
import { donationButtonSchema } from "@/server/validators/schemas";

type P = { slug: string };

/** The community's donation buttons (anyone who can see the community). */
export const GET = withApi<P>({ auth: "optional" }, async ({ params, viewer }) => listDonationButtons(viewer, params.slug));

/** Add a donation button (owners and admins). */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => created(await saveDonationButton(viewer, params.slug, await readJson(req, donationButtonSchema))));
