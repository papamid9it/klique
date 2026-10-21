import { readJson, withApi } from "@/server/http/api";
import { setOnboardingInterests } from "@/server/services/onboarding.service";
import { onboardingInterestsSchema } from "@/server/validators/schemas";

/** Step 1: the categories they're into (at least 3). Answers with the suggestions for step 2. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => setOnboardingInterests(viewer, (await readJson(req, onboardingInterestsSchema)).interests));
