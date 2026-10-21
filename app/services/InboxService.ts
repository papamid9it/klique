import ApiClient from "@/app/ApiCore";
import type { NotifyPrefs } from "@/lib/notifications";
import type { Envelope, NotificationDTO, Paginated } from "@/lib/types";

const api = new ApiClient();

/** The bell: your notification inbox and what you want to be notified about. */
export const InboxService = {
  list: (q: { before?: string; category?: string; unread?: boolean } = {}) =>
    api.get<Envelope<Paginated<NotificationDTO> & { unread: number; unreadBy: Record<string, number> }>>("/api/me/notifications", {
      ...(q.before ? { before: q.before } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.unread ? { unread: "1" } : {}),
    }),
  markRead: (input: { ids?: string[]; all?: true }) => api.post<Envelope<{ unread: number }>>("/api/me/notifications/read", input),
  prefs: () => api.get<Envelope<NotifyPrefs>>("/api/me/notify-prefs"),
  updatePrefs: (patch: Partial<Record<keyof NotifyPrefs, { inApp?: boolean; push?: boolean }>>) => api.patch<Envelope<NotifyPrefs>>("/api/me/notify-prefs", patch),
};
