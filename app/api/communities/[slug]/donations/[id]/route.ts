import { readJson, withApi } from "@/server/http/api";
import { deleteDonationButton, saveDonationButton } from "@/server/services/money.service";
import { donationButtonSchema } from "@/server/validators/schemas";

type P = { slug: string; id: string };

export const PATCH = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => saveDonationButton(viewer, params.slug, await readJson(req, donationButtonSchema), params.id));

/** Removes it (or hides it, when it has had donations). */
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => deleteDonationButton(viewer, params.slug, params.id));
