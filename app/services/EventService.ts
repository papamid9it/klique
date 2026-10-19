import ApiClient from "@/app/ApiCore";
import type { CityId, InterestId } from "@/lib/constants";
import type { DateFilter } from "@/lib/dates";
import type { AttendeesDTO, Envelope, EventDTO, Paginated, RsvpStatus, HostingOptionsDTO } from "@/lib/types";

const api = new ApiClient();

export interface EventListParams {
  /** where to look, e.g. "continent:africa" (see lib/places.ts) */
  where?: string;
  interest?: InterestId;
  price?: "any" | "free" | "paid";
  format?: "any" | "in-person" | "online";
  /** one calendar day, YYYY-MM-DD */
  day?: string;
  date?: DateFilter;
  q?: string;
  /** limit to one community (and optionally one of its groups) */
  community?: string;
  sub?: string;
  /** "going" | "saved" | "hosted" need a signed-in user */
  scope?: "all" | "going" | "saved" | "hosted";
  past?: boolean;
  page?: number;
}

export interface EventInput {
  title: string;
  description?: string;
  interest?: InterestId;
  country: string;
  region: string;
  city: CityId;
  neighborhood?: string;
  online?: boolean;
  venue: string;
  /** ISO 8601 */
  startsAt: string;
  endsAt?: string | null;
  priceNaira?: number;
  currency?: string;
  capacity?: number | null;
  coverImage?: string | null;
  /** host inside a community / one of its groups (you must be a member) */
  communitySlug?: string;
  subSlug?: string;
}

export interface EventsOverviewDTO {
  where: string;
  total: number;
  online: number;
  places: { scope: string; count: number }[];
  days: Record<string, number>;
}

export const EventService = {
  overview: (params: { where?: string; interest?: InterestId } = {}) => api.get<Envelope<EventsOverviewDTO>>("/api/events/overview", { ...params }, { ttl: 30 }),
  list: (params: EventListParams = {}) =>
    api.get<Envelope<Paginated<EventDTO>>>("/api/events", { ...params, past: params.past ? "true" : undefined }, { ttl: 20 }),
  get: (id: string) => api.get<Envelope<EventDTO>>(`/api/events/${id}`, undefined, { ttl: 15 }),
  create: (input: EventInput) => api.post<Envelope<EventDTO>>("/api/events", input),
  hosting: () => api.get<Envelope<HostingOptionsDTO>>("/api/events/hosting"),
  update: (id: string, patch: Partial<Omit<EventInput, "communitySlug" | "subSlug">> & { cancelled?: boolean }) =>
    api.patch<Envelope<EventDTO>>(`/api/events/${id}`, patch),
  remove: (id: string) => api.delete<Envelope<{ deleted: boolean }>>(`/api/events/${id}`),

  rsvp: (id: string, status: RsvpStatus = "going") => api.post<Envelope<EventDTO>>(`/api/events/${id}/rsvp`, { status }),
  cancelRsvp: (id: string) => api.delete<Envelope<EventDTO>>(`/api/events/${id}/rsvp`),
  save: (id: string) => api.post<Envelope<EventDTO>>(`/api/events/${id}/save`),
  unsave: (id: string) => api.delete<Envelope<EventDTO>>(`/api/events/${id}/save`),
  attendees: (id: string) => api.get<Envelope<AttendeesDTO>>(`/api/events/${id}/attendees`),
};

export interface EventsOverviewDTO {
  where: string;
  total: number;
  online: number;
  places: { scope: string; count: number }[];
  days: Record<string, number>;
}
