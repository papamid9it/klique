import { z } from "zod";
import { readJson, withApi } from "@/server/http/api";
import { assertAdmin } from "@/server/services/admin.service";
import { adminReorderGifts } from "@/server/services/gifts.service";

const body = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(200) });

export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => {
  assertAdmin(viewer);
  return adminReorderGifts((await readJson(req, body)).ids);
});
