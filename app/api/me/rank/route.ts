import { withApi } from "@/server/http/api";
import { rankProgress } from "@/server/services/hype.service";

/** Your rank, Hype, and how far to the next rank. */
export const GET = withApi({ auth: "required" }, async ({ viewer }) => rankProgress(viewer));
