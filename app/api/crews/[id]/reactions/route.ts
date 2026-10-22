import { readQuery, withApi } from "@/server/http/api";
import { crewReactions } from "@/server/services/crews.service";
import { reactionIdsQuery } from "@/server/validators/schemas";

type P = { id: string };

/** Fresh reaction counts for messages already on screen (`?ids=a,b,c`). */
export const GET = withApi<P, "required">({ auth: "required", limit: { name: "chat-read", max: 240, windowMs: 60_000 } }, async ({ req, params, viewer }) => crewReactions(viewer, params.id, readQuery(req, reactionIdsQuery).ids));
