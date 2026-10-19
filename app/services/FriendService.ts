import ApiClient from "@/app/ApiCore";
import type { Envelope, FriendDTO, FriendRequestDTO, FriendStatusDTO, FriendSuggestionDTO, FriendsSummaryDTO } from "@/lib/types";

const api = new ApiClient();

/** Friends and friend requests. Same service for web, mobile and desktop. */
export const FriendService = {
  list: () => api.get<Envelope<FriendDTO[]>>("/api/friends"),
  summary: () => api.get<Envelope<FriendsSummaryDTO>>("/api/friends/summary"),
  requests: () => api.get<Envelope<FriendRequestDTO[]>>("/api/friends/requests"),
  /** Ask someone to be friends. If they already asked you, this accepts. */
  add: (handle: string) => api.post<Envelope<FriendStatusDTO>>("/api/friends/requests", { handle }),
  accept: (id: string) => api.post<Envelope<{ action: string }>>(`/api/friends/requests/${id}`, { action: "accept" }),
  decline: (id: string) => api.post<Envelope<{ action: string }>>(`/api/friends/requests/${id}`, { action: "decline" }),
  cancel: (id: string) => api.delete<Envelope<{ cancelled: boolean }>>(`/api/friends/requests/${id}`),
  remove: (handle: string) => api.delete<Envelope<{ removed: boolean }>>(`/api/friends/${encodeURIComponent(handle)}`),
  /** people you share communities with, most in common first */
  suggestions: () => api.get<Envelope<FriendSuggestionDTO[]>>("/api/friends/suggestions"),
};
