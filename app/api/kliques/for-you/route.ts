import { readQuery, withApi } from "@/server/http/api";
import { listKliques } from "@/server/services/crews.service";
import { kliqueListQuery } from "@/server/validators/schemas";

/** "Kliques for you" on Home: ones you could join, best for you first (not yours, not full). */
export const GET = withApi({ auth: "optional" }, async ({ req, viewer }) => listKliques(viewer, readQuery(req, kliqueListQuery), { forYou: true }));
