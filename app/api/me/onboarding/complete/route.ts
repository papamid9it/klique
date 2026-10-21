import { withApi } from "@/server/http/api";
import { completeOnboarding } from "@/server/services/onboarding.service";

/** Finish /welcome (the server checks they picked 3 categories and joined 2 communities). */
export const POST = withApi({ auth: "required" }, async ({ viewer }) => completeOnboarding(viewer));
