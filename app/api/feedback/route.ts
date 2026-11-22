import { readJson, withApi } from "@/server/http/api";
import { feedbackSchema, submitFeedback } from "@/server/services/feedback.service";

/** Help & feedback in the apps: feedback, a problem, or a child safety concern, sent without leaving the app. */
export const POST = withApi({ auth: "required" }, async ({ req, viewer }) => submitFeedback(viewer, await readJson(req, feedbackSchema)));
