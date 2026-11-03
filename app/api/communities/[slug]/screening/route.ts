import { readJson, withApi } from "@/server/http/api";
import { getScreening, setScreening } from "@/server/services/screening.service";
import { resolveSpaceFor } from "@/server/services/spaces.service";
import { screeningSchema } from "@/server/validators/schemas";

type P = { slug: string };

/** The community's entry questions (what people answer before joining). */
export const GET = withApi<P>({ auth: "optional" }, async ({ params, viewer }) => getScreening((await resolveSpaceFor(viewer, params.slug)).space));

/** Owners and admins: change the questions or switch them on or off. People already in aren't affected. */
export const PUT = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { space, access } = await resolveSpaceFor(viewer, params.slug);
  return setScreening(space, access, await readJson(req, screeningSchema));
});
