import ApiClient from "@/app/ApiCore";
import type { ReactionKind } from "@/lib/reactions";
import type { ChannelMessageDTO, ChatPage, CrewDTO, CrewJoinMode, Envelope, EventCrewsDTO, KliqueListDTO, KliqueStartDTO, MyCrewDTO, ReactionDTO, UserBrief } from "@/lib/types";
import type { SendInput } from "./ChannelService";

const api = new ApiClient();

export interface CrewInput {
  title: string;
  interest: string;
  coverImage: string;
  womenOnly: boolean;
  /** who can join; mixed: `womenSpots` for women, `menSpots` for men, the rest anyone */
  audience?: "everyone" | "women" | "men" | "mixed";
  womenSpots?: number;
  menSpots?: number;
  area: string;
  meetupPoint: string;
  /** ISO date-time */
  meetupAt: string;
  note?: string;
  joinMode: CrewJoinMode;
  maxMembers: number;
}

export interface KliqueFilters {
  interest?: string;
  when?: "today" | "weekend" | "week";
  q?: string;
  /** one community's kliques */
  community?: string;
  /** only kliques in your communities */
  mine?: boolean;
  /** a place scope ("city:NG:lagos", "country:GH", "world") */
  where?: string;
  page?: number;
  limit?: number;
}
const filterQuery = (f: KliqueFilters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));

/** Kliques (the API still says "crews" for one klique's own routes): people doing something together. */
export const CrewService = {
  /** kliques to join near you, with filters (/kliques) */
  list: (f: KliqueFilters = {}) => api.get<Envelope<KliqueListDTO>>(`/api/kliques`, filterQuery(f)),
  /** "Kliques for you" on Home: not yours, not full, best for you first */
  forYou: (f: KliqueFilters = {}) => api.get<Envelope<KliqueListDTO>>(`/api/kliques/for-you`, filterQuery(f)),
  /** before the Start form: can you, Women only, your communities */
  startInfo: () => api.get<Envelope<KliqueStartDTO>>(`/api/kliques/start`),
  /** start a community's klique */
  createInCommunity: (community: string, input: CrewInput) => api.post<Envelope<CrewDTO>>(`/api/kliques`, { ...input, community }),
  /** `q`: crews coming from an area ("yaba"); `limit`: how many (grows with "Load more") */
  forEvent: (eventId: string, opts: { q?: string; limit?: number } = {}) => api.get<Envelope<EventCrewsDTO>>(`/api/events/${eventId}/crews`, { ...(opts.q ? { q: opts.q } : {}), ...(opts.limit ? { limit: String(opts.limit) } : {}) }),
  create: (eventId: string, input: CrewInput) => api.post<Envelope<CrewDTO>>(`/api/events/${eventId}/crews`, input),
  get: (id: string) => api.get<Envelope<CrewDTO>>(`/api/crews/${id}`),
  update: (id: string, patch: Partial<CrewInput>) => api.patch<Envelope<CrewDTO>>(`/api/crews/${id}`, patch),
  remove: (id: string) => api.delete<Envelope<{ deleted: true }>>(`/api/crews/${id}`),
  join: (id: string, message = "") => api.post<Envelope<CrewDTO>>(`/api/crews/${id}/join`, { message }),
  leave: (id: string) => api.delete<Envelope<CrewDTO>>(`/api/crews/${id}/join`),
  decide: (id: string, userId: string, accept: boolean) => api.post<Envelope<CrewDTO>>(`/api/crews/${id}/requests/${userId}`, { accept }),
  /** host: accept (as many as fit, oldest first) or decline every waiting request */
  decideAll: (id: string, accept: boolean) => api.post<Envelope<CrewDTO>>(`/api/crews/${id}/requests`, { accept }),
  removeMember: (id: string, userId: string) => api.delete<Envelope<CrewDTO>>(`/api/crews/${id}/members/${userId}`),
  /** the crew's chat, in the same shape as a community channel (see ChatSource) */
  messages: (id: string, cursor: { before?: string; after?: string } = {}) => api.get<Envelope<ChatPage>>(`/api/crews/${id}/messages`, { ...cursor }),
  send: (id: string, input: SendInput) => api.post<Envelope<ChannelMessageDTO>>(`/api/crews/${id}/messages`, input),
  editMessage: (id: string, messageId: string, body: string) => api.patch<Envelope<ChannelMessageDTO>>(`/api/crews/${id}/messages/${messageId}`, { body }),
  deleteMessage: (id: string, messageId: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/crews/${id}/messages/${messageId}`),
  react: (id: string, messageId: string, kind: ReactionKind) => api.post<Envelope<ReactionDTO[]>>(`/api/crews/${id}/messages/${messageId}/reactions`, { kind }),
  reactions: (id: string, ids: string[]) => api.get<Envelope<Record<string, ReactionDTO[]>>>(`/api/crews/${id}/reactions`, { ids: ids.join(",") }),
  markRead: (id: string) => api.post<Envelope<{ read: boolean }>>(`/api/crews/${id}/read`),
  mentionable: (id: string, q: string) => api.get<Envelope<UserBrief[]>>(`/api/crews/${id}/mentionable`, { q }),
  /** crews you're in for this community's events (its left panel) */
  mineIn: (slug: string) => api.get<Envelope<MyCrewDTO[]>>(`/api/communities/${slug}/crews/mine`),
};
