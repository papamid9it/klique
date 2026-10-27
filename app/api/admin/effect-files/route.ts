import { withApi } from "@/server/http/api";
import { ApiError } from "@/server/http/errors";
import { assertAdmin } from "@/server/services/admin.service";
import { EFFECT_MAX_BYTES, storeEffectFile } from "@/server/services/effect-files";

/** Upload a profile effect's file (the raw bytes; `?name=` is the file's name): checked, minified if JSON, stored. */
export const POST = withApi({ auth: "required", limit: { name: "effect-file", max: 30, windowMs: 10 * 60_000 } }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > EFFECT_MAX_BYTES) throw new ApiError(413, "Profile effects can be up to 8 MB.", { code: "too_large" });
  const name = new URL(req.url).searchParams.get("name") ?? "";
  return storeEffectFile(name, new Uint8Array(await req.arrayBuffer()));
});
