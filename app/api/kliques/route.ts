import { created, readJson, readQuery, withApi } from "@/server/http/api";
import { createCommunityKlique, listKliques } from "@/server/services/crews.service";
import { kliqueCreateSchema, kliqueListQuery } from "@/server/validators/schemas";

/** Kliques to join near you (`?interest=`, `?when=today|weekend|week`, `?q=` title or area, `?page=`). */
export const GET = withApi({ auth: "optional" }, async ({ req, viewer }) => listKliques(viewer, readQuery(req, kliqueListQuery)));

/** Start a community's klique (`community`: its slug). An event's kliques start at /api/events/[id]/crews. */
export const POST = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ req, viewer }) => created(await createCommunityKlique(viewer, await readJson(req, kliqueCreateSchema))));
