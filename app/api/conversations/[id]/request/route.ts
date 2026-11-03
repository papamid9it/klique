import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { decideMessageRequest } from "@/server/services/messaging.service";

/** Answer a message request: accept, delete (the sender isn't told) or block. */
export const POST = withApi<{ id: string }, "required">({ auth: "required" }, async ({ req, params, viewer }) => decideMessageRequest(viewer, params.id, (await readJson(req, z.object({ action: z.enum(["accept", "delete", "block"]) }))).action));
