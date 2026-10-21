import ApiClient from "@/app/ApiCore";
import type { Envelope, OnboardingDTO } from "@/lib/types";

const api = new ApiClient();

/** /welcome: categories first, then communities. */
export const OnboardingService = {
  state: () => api.get<Envelope<OnboardingDTO>>("/api/me/onboarding"),
  interests: (interests: string[]) => api.post<Envelope<OnboardingDTO>>("/api/me/onboarding/interests", { interests }),
  complete: () => api.post<Envelope<OnboardingDTO>>("/api/me/onboarding/complete"),
};
