import { withApi } from "@/server/http/api";
import { donationsOn, liveProviders, PROVIDER_LABEL } from "@/server/services/payments-setting";

/** Public: can people pay on the website right now, with which companies, and give to communities? (Admin → System.) */
export const GET = withApi({ auth: "none" }, async () => {
  const live = await liveProviders();
  return { web: live.length > 0, donations: await donationsOn(), providers: live.map((id) => ({ id, label: PROVIDER_LABEL[id] })) };
});
