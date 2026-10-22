import ApiClient from "@/app/ApiCore";
import type { Envelope, SavedStickerDTO } from "@/lib/types";

const api = new ApiClient();

/** Your saved stickers: kept on your account so they're the same on the web, your phone and the desktop app. */
export const StickerService = {
  list: () => api.get<Envelope<SavedStickerDTO[]>>("/api/me/stickers"),
  /** save a posted picture (or one you just uploaded) as a sticker; returns the whole tray */
  save: (url: string) => api.post<Envelope<SavedStickerDTO[]>>("/api/me/stickers", { url }),
  remove: (id: string) => api.delete<Envelope<SavedStickerDTO[]>>(`/api/me/stickers/${id}`),
  reorder: (ids: string[]) => api.put<Envelope<SavedStickerDTO[]>>("/api/me/stickers/order", { ids }),
};
