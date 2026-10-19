import ApiClient from "@/app/ApiCore";
import type {
  Envelope,
  InviteDTO,
  JoinResult,
  MemberDTO,
  MembershipRequestDTO,
  Paginated,
  PostDTO,
  Role,
} from "@/lib/types";

const api = new ApiClient();

/**
 * A "space" is a community OR a group (subcommunity) inside one. Both expose the
 * same sub-resources, so these calls take `(slug, subSlug?)`: omit `subSlug` for a community.
 */
const base = (slug: string, subSlug?: string) =>
  subSlug ? `/api/communities/${slug}/groups/${subSlug}` : `/api/communities/${slug}`;

export const SpaceService = {
  join: (slug: string, subSlug?: string, input: { message?: string } = {}) =>
    api.post<Envelope<JoinResult>>(`${base(slug, subSlug)}/join`, input),
  /** Also cancels a pending join request. */
  leave: (slug: string, subSlug?: string) =>
    api.post<Envelope<{ left: boolean; cancelledRequest: boolean }>>(`${base(slug, subSlug)}/leave`),

  members: (slug: string, subSlug?: string, page = 1, q?: string) =>
    api.get<Envelope<Paginated<MemberDTO>>>(`${base(slug, subSlug)}/members`, { page, q }),
  changeRole: (slug: string, userId: string, role: Exclude<Role, "owner">, subSlug?: string) =>
    api.patch<Envelope<{ userId: string; role: Role }>>(`${base(slug, subSlug)}/members/${userId}`, { role }),
  /** Owner only: make this member the owner (you become an admin). */
  transferOwnership: (slug: string, userId: string, subSlug?: string) =>
    api.post<Envelope<{ ownerId: string }>>(`${base(slug, subSlug)}/members/${userId}/owner`),
  removeMember: (slug: string, userId: string, opts: { ban?: boolean; subSlug?: string } = {}) =>
    api.delete<Envelope<{ removed: boolean }>>(`${base(slug, opts.subSlug)}/members/${userId}`, { ban: opts.ban ? "true" : undefined }),

  requests: (slug: string) => api.get<Envelope<MembershipRequestDTO[]>>(`${base(slug)}/requests`),
  decideRequest: (slug: string, requestId: string, action: "approve" | "reject") =>
    api.post<Envelope<{ requestId: string; action: string }>>(`${base(slug)}/requests/${requestId}`, { action }),

  invites: (slug: string, subSlug?: string) => api.get<Envelope<InviteDTO[]>>(`${base(slug, subSlug)}/invites`),
  createInvite: (slug: string, subSlug?: string, input: { expiresInDays?: number; maxUses?: number } = {}) =>
    api.post<Envelope<InviteDTO>>(`${base(slug, subSlug)}/invites`, input),
  revokeInvite: (slug: string, inviteId: string, subSlug?: string) =>
    api.delete<Envelope<{ revoked: boolean }>>(`${base(slug, subSlug)}/invites/${inviteId}`),

  posts: (slug: string, subSlug?: string, page = 1) =>
    api.get<Envelope<Paginated<PostDTO>>>(`${base(slug, subSlug)}/posts`, { page }),
  createPost: (slug: string, input: { body: string; imageUrl?: string | null }, subSlug?: string) =>
    api.post<Envelope<PostDTO>>(`${base(slug, subSlug)}/posts`, input),
  deletePost: (slug: string, postId: string, subSlug?: string) =>
    api.delete<Envelope<{ deleted: boolean }>>(`${base(slug, subSlug)}/posts/${postId}`),
};
