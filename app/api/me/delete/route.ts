import { z } from "zod";
import { signedOutResponse } from "@/server/http/auth-response";
import { readJson, withApi } from "@/server/http/api";
import { deleteAccount, ownedCommunities } from "@/server/services/account-delete.service";

const body = z.object({ password: z.string().max(200).optional(), confirm: z.string().trim().min(1, "Type your handle to confirm").max(60) });

/** What's in the way of deleting (communities they still own). */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => ({ ownedCommunities: await ownedCommunities(viewer._id) }));

/** Delete my account, then sign out. */
export const POST = withApi({ auth: "required", limit: { name: "delete-account", max: 5, windowMs: 15 * 60_000 } }, async ({ req, viewer }) => {
  await deleteAccount(viewer, await readJson(req, body));
  return signedOutResponse();
});
