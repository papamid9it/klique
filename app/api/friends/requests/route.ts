import { created, readJson, withApi } from "@/server/http/api";
import { listRequests, sendRequest } from "@/server/services/friends.service";
import { friendRequestSchema } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ viewer }) => listRequests(viewer));
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { handle } = await readJson(req, friendRequestSchema);
  return created(await sendRequest(viewer, handle));
});
