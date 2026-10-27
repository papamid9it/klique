import { withApi } from "@/server/http/api";
import { pointsProgress } from "@/server/services/points.service";

/** Your points, what earns them, and how much of each you can still earn today. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => pointsProgress(viewer));
