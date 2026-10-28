import ApiClient from "@/app/ApiCore";
import type { Envelope, TypingDTO, TypingTarget } from "@/lib/types";

const api = new ApiClient();

/** "X is typing…" in a chat (community or group channel, DM, crew). */
export const TypingService = {
  who: (target: TypingTarget) => api.get<Envelope<TypingDTO>>("/api/typing", { target: JSON.stringify(target) }),
  set: (target: TypingTarget, on: boolean) => api.post<Envelope<TypingDTO>>("/api/typing", { target, on }),
};
