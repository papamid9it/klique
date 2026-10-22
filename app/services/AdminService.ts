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
  DraftBulkResult,
  DraftDTO,
  FinderQueryDTO,
  FinderRunDTO,
  SavedSearchDTO,
  DraftPatch,
  DraftStatus,
  Envelope,
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
  /** read one link (and the event pages it lists): returns a finder job to step through */
  importLink: (url: string) => api.post<Envelope<FinderRunDTO>>("/api/admin/drafts", { url }),
  bulkDrafts: (ids: string[], action: "approve" | "reject", where: { communitySlug?: string; subSlug?: string } = {}) => api.post<Envelope<DraftBulkResult>>("/api/admin/drafts/bulk", { ids, action, ...where }),
  /* event finder: a search is a job, worked a step at a time by the page */
  startSearch: (q: FinderQueryDTO) => api.post<Envelope<FinderRunDTO>>("/api/admin/finder/runs", q),
  stepSearch: (id: string) => api.post<Envelope<FinderRunDTO>>(`/api/admin/finder/runs/${id}/step`),
  recentRuns: () => api.get<Envelope<FinderRunDTO[]>>("/api/admin/finder/runs"),
  savedSearches: () => api.get<Envelope<SavedSearchDTO[]>>("/api/admin/finder/searches"),
  saveSearch: (q: Omit<SavedSearchDTO, "id" | "lastRunAt" | "lastAdded" | "daily">) => api.post<Envelope<SavedSearchDTO>>("/api/admin/finder/searches", q),
  updateSearch: (id: string, patch: { daily?: boolean; name?: string; days?: number }) => api.patch<Envelope<SavedSearchDTO>>(`/api/admin/finder/searches/${id}`, patch),
  removeSearch: (id: string) => api.delete<Envelope<{ removed: boolean }>>(`/api/admin/finder/searches/${id}`),
  runSearch: (id: string) => api.post<Envelope<FinderRunDTO>>(`/api/admin/finder/searches/${id}/run`),
  updateDraft: (id: string, patch: DraftPatch) => api.patch<Envelope<DraftDTO>>(`/api/admin/drafts/${id}`, patch),
  approveDraft: (id: string, patch: DraftPatch = {}, where: { communitySlug?: string; subSlug?: string } = {}) => api.post<Envelope<{ eventId: string }>>(`/api/admin/drafts/${id}/approve`, { ...patch, ...where }),
  rejectDraft: (id: string) => api.post<Envelope<{ rejected: boolean }>>(`/api/admin/drafts/${id}/reject`),

  sources: () => api.get<Envelope<SourceDTO[]>>("/api/admin/sources"),
  addSource: (url: string, name = "") => api.post<Envelope<SourceDTO>>("/api/admin/sources", { url, name }),
  removeSource: (id: string) => api.delete<Envelope<{ removed: boolean }>>(`/api/admin/sources/${id}`),
  runSources: () => api.post<Envelope<FinderRunDTO>>("/api/admin/sources/run"),
};
