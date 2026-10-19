import ApiClient from "@/app/ApiCore";
import type { Envelope } from "@/lib/types";

const api = new ApiClient();

/** Phone notifications: the app tells the server where to send them. */
export const PushService = {
  register: (token: string, platform: "ios" | "android") => api.post<Envelope<{ registered: boolean }>>("/api/me/push", { token, platform }),
  unregister: (token: string) => api.delete<Envelope<{ removed: boolean }>>("/api/me/push", { token }),
};
