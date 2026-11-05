import { withApi } from "@/server/http/api";
import { joinedKliques } from "@/server/services/crews.service";

/** The kliques you're in or asked to join, for the Joined list. */
export const GET = withApi<Record<string, never>, "required">({ auth: "required" }, async ({ viewer }) => joinedKliques(viewer));
