import { readQuery, withApi } from "@/server/http/api";
import { communitySidebars } from "@/server/services/sidebars.service";
import { sidebarsQuery } from "@/server/validators/schemas";

/** GET /api/me/sidebars?slugs=a,b,c — header, channels and boards for up to 20 communities at once. */
export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => communitySidebars(viewer, readQuery(req, sidebarsQuery).slugs));
