import "server-only";
import type { CommunityReviewDTO, ReviewCountDTO } from "@/lib/types";
import { forbidden } from "../http/errors";
import { Event } from "../models/Event";
import { MembershipRequest } from "../models/MembershipRequest";
import type { ICommunity } from "../models/Community";
import type { IUser } from "../models/User";
import { can, type SpaceAccess } from "../policies/access";
import { isSiteAdmin } from "../policies/hosting";
import { pendingEvents } from "./events.service";
import { resolveSpaceFor } from "./spaces.service";

/**
 * "To review" in a community, like Reddit's mod queue: members' events waiting for approval (for the owner, admins
 * and anyone whose role has "Manage events"), and join requests (owner and admins). Everyone else gets nothing.
 */
const reviewsEvents = (access: SpaceAccess, viewer: IUser | null) => access.canManage || can(access, "manageEvents") || (!!viewer && isSiteAdmin(viewer));
const reviewsRequests = (access: SpaceAccess, viewer: IUser | null) => access.canManage || (!!viewer && isSiteAdmin(viewer));

/** How many are waiting, for the badge on "To review". Null when this viewer reviews nothing here. */
export async function reviewCounts(viewer: IUser | null, community: Pick<ICommunity, "_id" | "privacy">, access: SpaceAccess): Promise<ReviewCountDTO | null> {
  const events = reviewsEvents(access, viewer);
  const requests = reviewsRequests(access, viewer);
  if (!events && !requests) return null;
  const [e, r] = await Promise.all([
    events ? Event.countDocuments({ communityId: community._id, review: "pending", cancelled: false }) : 0,
    requests && community.privacy === "private" ? MembershipRequest.countDocuments({ communityId: community._id, subcommunityId: null, status: "pending" }) : 0,
  ]);
  return { events: e, requests: r, canRequests: requests };
}

/** The list itself: the events waiting (oldest first, only those this viewer may decide on) and the request count. */
export async function communityReview(viewer: IUser, slug: string): Promise<CommunityReviewDTO> {
  const { space, access } = await resolveSpaceFor(viewer, slug);
  if (!reviewsEvents(access, viewer) && !reviewsRequests(access, viewer)) throw forbidden("Only people who approve things here see this.");
  const c = space.community;
  const [events, counts] = await Promise.all([reviewsEvents(access, viewer) ? pendingEvents(viewer, c._id) : [], reviewCounts(viewer, c, access)]);
  return { events, requests: counts?.requests ?? 0, canRequests: !!counts?.canRequests };
}
