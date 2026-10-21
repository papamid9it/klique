import ApiClient from "@/app/ApiCore";
import type { CrewDTO, CrewJoinMode, CrewMessageDTO, Envelope, EventCrewsDTO, MyCrewDTO } from "@/lib/types";

const api = new ApiClient();

export interface CrewInput {
  area: string;
  meetupPoint: string;
  /** ISO date-time */
  meetupAt: string;
  note?: string;
  joinMode: CrewJoinMode;
  maxMembers: number;
}

/** Crews: people going to an event together. */
export const CrewService = {
  forEvent: (eventId: string) => api.get<Envelope<EventCrewsDTO>>(`/api/events/${eventId}/crews`),
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
  messages: (id: string, after?: string) => api.get<Envelope<CrewMessageDTO[]>>(`/api/crews/${id}/messages`, after ? { after } : undefined),
  /** crews you're in for this community's events (its left panel) */
  mineIn: (slug: string) => api.get<Envelope<MyCrewDTO[]>>(`/api/communities/${slug}/crews/mine`),
  send: (id: string, body: string, replyToId?: string | null) => api.post<Envelope<CrewMessageDTO>>(`/api/crews/${id}/messages`, { body, replyToId: replyToId ?? null }),
};
