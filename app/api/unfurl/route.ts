import { readQuery, withApi } from "@/server/http/api";
import { unfurl } from "@/server/services/unfurl.service";
import { unfurlQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { url } = readQuery(req, unfurlQuery);
  return unfurl(viewer, url);
});
