import "server-only";
import { LIMITS } from "@/lib/constants";
import type { VerificationDTO } from "@/lib/types";
import { conflict, forbidden } from "../http/errors";
import { Community, type ICommunity } from "../models/Community";
import type { IUser } from "../models/User";
import { siteAdminIds } from "./ad-campaigns.service";
import { notify } from "./push.service";
import { resolveSpaceFor } from "./spaces.service";
import { planOf } from "./subscriptions.service";

/**
 * The Verified check: a community's owner applies, a site admin looks at the community by hand (active? nothing erotic,
 * criminal or drug-related?) and approves it from Admin -> Communities. These checks only decide who may apply.
 */
function checksFor(c: ICommunity, owner: IUser): VerificationDTO["checks"] {
  return [
    { id: "plan", label: "You're on Lite or Pro", met: planOf(owner) !== "free" },
    { id: "members", label: `At least ${LIMITS.verifyMembers.toLocaleString("en-NG")} members (${c.memberCount.toLocaleString("en-NG")} now)`, met: c.memberCount >= LIMITS.verifyMembers },
    { id: "content", label: "Not an 18+ community", met: !c.adult && !c.explicit },
  ];
}

function toDTO(c: ICommunity, owner: IUser): VerificationDTO {
  const checks = checksFor(c, owner);
  const verified = !!c.verified || !!c.official;
  const request = c.verificationRequest ?? null;
  const state = verified ? "verified" : (request?.status ?? "none");
  return {
    state,
    requestedAt: request?.requestedAt ? new Date(request.requestedAt).toISOString() : null,
    note: request?.status === "rejected" ? request.note || null : null,
    checks,
    canApply: (state === "none" || state === "rejected") && checks.every((x) => x.met),
  };
}

async function ownedCommunity(viewer: IUser, slug: string) {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (access.role !== "owner") throw forbidden("Only the owner of this community can do that.");
  return space.community;
}

export async function getVerification(viewer: IUser, slug: string): Promise<VerificationDTO> {
  return toDTO(await ownedCommunity(viewer, slug), viewer);
}

export async function applyForVerification(viewer: IUser, slug: string): Promise<VerificationDTO> {
  const c = await ownedCommunity(viewer, slug);
  const before = toDTO(c, viewer);
  if (before.state === "verified") throw conflict("This community is already verified.");
  if (before.state === "pending") throw conflict("This community is already waiting to be checked.");
  const missing = before.checks.find((x) => !x.met);
  if (missing) throw forbidden(`This community can't apply yet. It needs: ${missing.label}.`);

  const verificationRequest = { status: "pending" as const, requestedAt: new Date() };
  await Community.updateOne({ _id: c._id }, { $set: { verificationRequest } });
  void siteAdminIds().then((ids) =>
    notify(ids, { title: `${c.name} applied to be verified`, body: `${c.memberCount.toLocaleString("en-NG")} members. Check it and decide in Admin.`, data: { href: "/admin/communities?view=verification" } }, { actorId: viewer._id, category: "admin", groupKey: "verification-review", many: (n) => `${n} communities waiting to be verified`, ref: "verification-review" }),
  );
  return toDTO({ ...c, verificationRequest }, viewer);
}
