import { withApi } from "@/server/http/api";
import { uploadStatus } from "@/server/services/uploads.service";

export const GET = withApi({ auth: "optional" }, async () => uploadStatus());
