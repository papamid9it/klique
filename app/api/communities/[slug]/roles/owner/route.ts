import { readJson, withApi } from "@/server/http/api";
import { ownerIconInput, setOwnerIcon } from "@/server/services/roles.service";

/** The emoji on the owner's picture inside the community. */
export const PUT = withApi<{ slug: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => setOwnerIcon(viewer, params.slug, (await readJson(req, ownerIconInput)).icon));
