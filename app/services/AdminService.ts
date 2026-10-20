import ApiClient from "@/app/ApiCore";
import type {
  AdminCommunityRow,
  AdminEventFilter,
  AdminEventRow,
  AdminOverviewDTO,
  AdminSummaryDTO,
  AdminUserDTO,
  AdminUserDetailDTO,
  AdminUserFilter,
  AuditEntryDTO,
  DraftDTO,
  DraftPatch,
  DraftStatus,
  Envelope,
  ImportResult,
  Paginated,
  ReportAction,
  ReportDTO,
  ReportStatus,
  SourceDTO,
  SystemStatusDTO,
} from "@/lib/types";

const api = new ApiClient();

/** Site-admin tools behind /admin. Every call answers 403 for anyone not in ADMIN_EMAILS. */
export const AdminService = {
  summary: () => api.get<Envelope<AdminSummaryDTO>>("/api/admin/summary"),

  reports: (status: ReportStatus, page = 1) => api.get<Envelope<Paginated<ReportDTO>>>("/api/admin/reports", { status, page }),
  actOnReport: (id: string, action: ReportAction, note?: string) => api.post<Envelope<{ status: ReportStatus }>>(`/api/admin/reports/${id}`, { action, note }),

  overview: () => api.get<Envelope<AdminOverviewDTO>>("/api/admin/overview"),
  system: () => api.get<Envelope<SystemStatusDTO>>("/api/admin/system"),
  audit: (params: { page?: number; q?: string; action?: string }) => api.get<Envelope<Paginated<AuditEntryDTO>>>("/api/admin/audit", params),

  users: (params: { filter?: AdminUserFilter; q?: string; page?: number }) => api.get<Envelope<Paginated<AdminUserDTO>>>("/api/admin/users", params),
  user: (id: string) => api.get<Envelope<AdminUserDetailDTO>>(`/api/admin/users/${id}`),
  updateUser: (id: string, patch: { suspended?: boolean; signOut?: true; reason?: string }) => api.patch<Envelope<AdminUserDTO>>(`/api/admin/users/${id}`, patch),

  events: (params: { filter?: AdminEventFilter; q?: string; page?: number }) => api.get<Envelope<Paginated<AdminEventRow>>>("/api/admin/events", params),
  setEventCancelled: (id: string, cancelled: boolean, note = "") => api.patch<Envelope<{ cancelled: boolean }>>(`/api/admin/events/${id}`, { cancelled, note }),
  deleteEvent: (id: string, note = "") => api.delete<Envelope<{ deleted: boolean }>>(`/api/admin/events/${id}`, { note }),

  communities: (params: { sort?: "members" | "new"; q?: string; page?: number }) => api.get<Envelope<Paginated<AdminCommunityRow>>>("/api/admin/communities", params),
  deleteCommunity: (id: string, note = "") => api.delete<Envelope<{ deleted: boolean }>>(`/api/admin/communities/${id}`, { note }),

  drafts: (status: DraftStatus) => api.get<Envelope<DraftDTO[]>>("/api/admin/drafts", { status }),
  importLink: (url: string) => api.post<Envelope<ImportResult>>("/api/admin/drafts", { url }),
  updateDraft: (id: string, patch: DraftPatch) => api.patch<Envelope<DraftDTO>>(`/api/admin/drafts/${id}`, patch),
  approveDraft: (id: string, patch: DraftPatch = {}) => api.post<Envelope<{ eventId: string }>>(`/api/admin/drafts/${id}/approve`, patch),
  rejectDraft: (id: string) => api.post<Envelope<{ rejected: boolean }>>(`/api/admin/drafts/${id}/reject`),

  sources: () => api.get<Envelope<SourceDTO[]>>("/api/admin/sources"),
  addSource: (url: string, name = "") => api.post<Envelope<SourceDTO>>("/api/admin/sources", { url, name }),
  removeSource: (id: string) => api.delete<Envelope<{ removed: boolean }>>(`/api/admin/sources/${id}`),
  runSources: () => api.post<Envelope<{ sources: number; added: number }>>("/api/admin/sources/run"),
};
