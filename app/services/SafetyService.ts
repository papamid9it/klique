import ApiClient from "@/app/ApiCore";
import type { BlockedUserDTO, Envelope, ReportInput } from "@/lib/types";

const api = new ApiClient();

export const SafetyService = {
  report: (input: ReportInput) => api.post<Envelope<{ reported: boolean }>>("/api/reports", input),
  block: (handle: string) => api.post<Envelope<{ blocked: boolean }>>(`/api/blocks/${encodeURIComponent(handle)}`),
  unblock: (handle: string) => api.delete<Envelope<{ blocked: boolean }>>(`/api/blocks/${encodeURIComponent(handle)}`),
  blocked: () => api.get<Envelope<BlockedUserDTO[]>>("/api/blocks"),
};
