import { readJson, withApi } from "@/server/http/api";
import { uploadSignSchema } from "@/server/validators/schemas";
import { signUpload } from "@/server/services/uploads.service";

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  const { kind, files } = await readJson(req, uploadSignSchema);
  return signUpload(viewer, kind, files);
});
