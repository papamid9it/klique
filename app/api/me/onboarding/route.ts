import { withApi } from "@/server/http/api";
import { onboardingState } from "@/server/services/onboarding.service";

/** Where they are in /welcome, and which communities to suggest. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => onboardingState(viewer));
