import ApiClient from "@/app/ApiCore";
import type { BlockedUserDTO, Envelope, ReportInput } from "@/lib/types";

const api = new ApiClient();

/** blocked people per page */
export const BLOCKED_PAGE = 20;

export const SafetyService = {
  report: (input: ReportInput) => api.post<Envelope<{ reported: boolean }>>("/api/reports", input),
  block: (handle: string) => api.post<Envelope<{ blocked: boolean }>>(`/api/blocks/${encodeURIComponent(handle)}`),
  unblock: (handle: string) => api.delete<Envelope<{ blocked: boolean }>>(`/api/blocks/${encodeURIComponent(handle)}`),
  /** a page of blocked people, newest first; `before` is the last one's blockedAt */
  blocked: (before?: string) => api.get<Envelope<BlockedUserDTO[]>>(`/api/blocks?limit=${BLOCKED_PAGE}${before ? `&before=${encodeURIComponent(before)}` : ""}`),
};
