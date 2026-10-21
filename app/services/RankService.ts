import ApiClient from "@/app/ApiCore";
import type { RanksConfig } from "@/lib/ranks";
import type { AttendanceDTO, Envelope, RankProgressDTO } from "@/lib/types";

const api = new ApiClient();

/** Ranks and Hype: the ladder, your progress, the host's "Who came?", and the admin settings. */
export const RankService = {
  config: () => api.get<Envelope<RanksConfig>>("/api/ranks"),
  mine: () => api.get<Envelope<RankProgressDTO>>("/api/me/rank"),
  attendance: (eventId: string) => api.get<Envelope<AttendanceDTO>>(`/api/events/${eventId}/attendance`),
  setAttendance: (eventId: string, userIds: string[], attended: boolean) => api.post<Envelope<AttendanceDTO>>(`/api/events/${eventId}/attendance`, { userIds, attended }),
  adminConfig: () => api.get<Envelope<RanksConfig>>("/api/admin/ranks"),
  setConfig: (c: Partial<RanksConfig>) => api.put<Envelope<RanksConfig>>("/api/admin/ranks", c),
};
