import ApiClient from "@/app/ApiCore";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();

/** Pin a chat or a community to the top of your own lists (it follows your account). */
export const PinService = {
  set: (kind: "chat" | "community", id: string, on: boolean) => api.post<Envelope<{ kind: string; id: string; on: boolean }>>("/api/me/pins", { kind, id, on }),
};
