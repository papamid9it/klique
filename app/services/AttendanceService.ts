import ApiClient from "@/app/ApiCore";
import type { AttendanceDTO, Envelope } from "@/lib/types";

const api = new ApiClient();

/** The host's "Who came?" for an event (confirming people earns them and the host points). */
export const AttendanceService = {
  attendance: (eventId: string) => api.get<Envelope<AttendanceDTO>>(`/api/events/${eventId}/attendance`),
  setAttendance: (eventId: string, userIds: string[], attended: boolean) => api.post<Envelope<AttendanceDTO>>(`/api/events/${eventId}/attendance`, { userIds, attended }),
};
