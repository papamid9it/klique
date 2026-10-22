import { withApi } from "@/server/http/api";
import { markCrewChatRead } from "@/server/services/crews.service";

type P = { id: string };

/** The chat is on screen: everything in it is read. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => markCrewChatRead(viewer, params.id));
