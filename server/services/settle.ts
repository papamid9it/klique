import "server-only";
import { settleCampaign } from "./ad-campaigns.service";
import { settleTopup } from "./gifts.service";
import { settleCheckout } from "./subscriptions.service";

/**
 * A payment company says something happened to one of our checkouts. We never take its word for it: the reference
 * only picks which checkout to look at, and each one asks the company itself whether it's really paid.
 * khy_ Hype, ksb_ Lite/Pro, kad_ an ad. Anything else isn't ours.
 */
export async function settlePayment(reference: unknown): Promise<void> {
  if (typeof reference !== "string" || !/^(khy|ksb|kad)_[a-f0-9]{18}$/.test(reference)) return;
  if (reference.startsWith("khy_")) await settleTopup(reference);
  else if (reference.startsWith("ksb_")) await settleCheckout(reference);
  else await settleCampaign(reference);
}
