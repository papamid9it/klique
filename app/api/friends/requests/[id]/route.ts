import { readJson, withApi } from "@/server/http/api";
import { cancelRequest, respondToRequest } from "@/server/services/friends.service";
import { friendRespondSchema } from "@/server/validators/schemas";

type P = { id: string };
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { action } = await readJson(req, friendRespondSchema);
  return respondToRequest(viewer, params.id, action);
});
export const DELETE = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => cancelRequest(viewer, params.id));
