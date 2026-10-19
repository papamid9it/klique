import "server-only";
import { formatDateShort, isFree } from "@/lib/format";
import { getInterest } from "@/lib/constants";
import { placeLabel } from "@/lib/places";
import { connectDb } from "../db";
import { getCommunity } from "./communities.service";
import { getEvent } from "./events.service";

/**
 * What a shared link shows (WhatsApp, X, iMessage…). Only what a signed-out visitor could see anyway:
 * anything private or missing returns null and the link falls back to the generic klique card.
 */
export interface ShareInfo {
  title: string;
  description: string;
  eyebrow: string;
  lines: string[];
  image: string | null;
}

/** "NGN 2,000" / "Free": the share-card font has no ₦ (or other currency) glyphs, so codes it is. */
const priceForCard = (amount: number, currency: string) => (isFree(amount) ? "Free" : `${currency} ${amount.toLocaleString("en-US")}`);

export async function eventShare(id: string): Promise<ShareInfo | null> {
  await connectDb();
  try {
    const e = await getEvent(null, id);
    const where = e.online ? "Online" : [e.venue, placeLabel(e)].filter(Boolean).join(", ");
    const when = formatDateShort(e.startsAt);
    return {
      title: e.title,
      description: `${when} · ${where}${e.description ? ` · ${e.description.slice(0, 140)}` : ""}`,
      eyebrow: e.isPast ? "Past event" : (getInterest(e.interest)?.name ?? "Event"),
      lines: [when, where, priceForCard(e.priceNaira, e.currency)],
      image: e.coverImage,
    };
  } catch {
    return null;
  }
}

export async function communityShare(slug: string): Promise<ShareInfo | null> {
  await connectDb();
  try {
    const c = await getCommunity(null, slug);
    if (c.privacy !== "public") return { title: c.name, description: "A private community on klique.", eyebrow: "Private community", lines: [], image: null };
    return {
      title: c.name,
      description: c.description.slice(0, 200) || `A ${getInterest(c.interest)?.name ?? ""} community in ${placeLabel(c)}.`,
      eyebrow: getInterest(c.interest)?.name ?? "Community",
      lines: [placeLabel(c), c.memberCount === null ? "" : `${c.memberCount.toLocaleString("en-US")} ${c.memberCount === 1 ? "member" : "members"}`],
      image: c.coverImage,
    };
  } catch {
    return null;
  }
}
