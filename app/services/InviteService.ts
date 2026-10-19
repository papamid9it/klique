import ApiClient from "@/app/ApiCore";
import type { Envelope, InvitePreviewDTO, JoinResult } from "@/lib/types";

const api = new ApiClient();

export const InviteService = {
  preview: (code: string) => api.get<Envelope<InvitePreviewDTO>>(`/api/invites/${encodeURIComponent(code)}`),
  accept: (code: string) =>
    api.post<Envelope<JoinResult & { slug: string; parentSlug?: string }>>(`/api/invites/${encodeURIComponent(code)}`),
};
