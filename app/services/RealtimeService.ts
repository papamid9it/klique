import ApiClient from "@/app/ApiCore";
import type { Envelope, RealtimeTokenDTO } from "@/lib/types";

const api = new ApiClient();

/** Realtime (Ably) auth. The native/desktop apps use the same call. */
export const RealtimeService = {
  token: () => api.get<Envelope<RealtimeTokenDTO>>("/api/realtime/token"),
};
