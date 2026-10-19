import ApiClient from "@/app/ApiCore";
import type { AdminSummaryDTO, AdminUserDTO, DraftDTO, DraftPatch, DraftStatus, Envelope, ImportResult, Paginated, ReportAction, ReportDTO, ReportStatus, SourceDTO } from "@/lib/types";

const api = new ApiClient();

/** Site-admin tools behind /admin. Every call answers 403 for anyone not in ADMIN_EMAILS. */
export const AdminService = {
  summary: () => api.get<Envelope<AdminSummaryDTO>>("/api/admin/summary"),

  reports: (status: ReportStatus, page = 1) => api.get<Envelope<Paginated<ReportDTO>>>("/api/admin/reports", { status, page }),
  actOnReport: (id: string, action: ReportAction, note?: string) => api.post<Envelope<{ status: ReportStatus }>>(`/api/admin/reports/${id}`, { action, note }),

  users: (q = "") => api.get<Envelope<AdminUserDTO[]>>("/api/admin/users", { q }),
  updateUser: (id: string, patch: { canHostPublic?: boolean; suspended?: boolean; reason?: string }) => api.patch<Envelope<AdminUserDTO>>(`/api/admin/users/${id}`, patch),

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
