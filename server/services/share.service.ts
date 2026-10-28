import "server-only";
import { formatDateShort, isFree } from "@/lib/format";
import { getInterest } from "@/lib/constants";
import { placeLabel } from "@/lib/places";
import { connectDb } from "../db";
import { getCommunity } from "./communities.service";
import { getCrew } from "./crews.service";
import { getEvent } from "./events.service";
import { resolveSpaceFor } from "./spaces.service";
import { getTopic } from "./topics.service";
import { getPost, postCommunitySlug } from "./feed.service";
import { getProfile } from "./users.service";

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
    // an 18+ community: a plain card, not even its name
    if (c.adult) return { title: "Klique", description: "A community on Klique.", eyebrow: "Community", lines: [], image: null };
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

/**
 * A post: who posted it where, and its first picture. Anything a signed-out visitor can't see (a private or 18+
 * community, an explicit post) gets a plain card that says nothing about it.
 */
export async function postShare(id: string): Promise<ShareInfo | null> {
  await connectDb();
  const plain: ShareInfo = { title: "Klique", description: "A post on Klique.", eyebrow: "Post", lines: [], image: null };
  try {
    const slug = await postCommunitySlug(id);
    const { space, access } = await resolveSpaceFor(null, slug).catch(() => ({ space: null, access: null }));
    if (!space || !access || space.community.adult) return plain;
    const p = await getPost(null, space, access, id).catch(() => null);
    if (!p) return { ...plain, description: `A post in ${space.community.name}, a private community on Klique.` };
    if (p.explicit) return plain;
    const first = p.media[0];
    const text = (p.title || p.caption).trim();
    return {
      title: `${p.author.displayName} in ${p.community.name}`,
      description: text.slice(0, 200) || `A post in ${p.community.name}.`,
      eyebrow: "Post",
      lines: [p.title ? p.title.slice(0, 80) : p.caption.slice(0, 80)].filter(Boolean),
      image: first ? (first.kind === "video" ? (first.poster ?? null) : first.url) : null,
    };
  } catch {
    return null;
  }
}

/**
 * A crew: where it's coming from, the event, when it meets and how full it is. Never the meetup point (members only).
 * A crew whose event a signed-out visitor can't see gets a plain card.
 */
export async function crewShare(id: string): Promise<ShareInfo | null> {
  await connectDb();
  try {
    const c = await getCrew(null, id);
    const meet = `Meet ${formatDateShort(c.meetupAt)}`;
    const going = `${c.memberCount}/${c.maxMembers} going together`;
    return {
      title: `Crew from ${c.area}`,
      description: `Going to ${c.event.title} together. ${meet} · ${going}. Join a crew near you on klique.`,
      eyebrow: "Crew",
      lines: [`To ${c.event.title}`, meet, going],
      image: c.event.coverImage,
    };
  } catch {
    return { title: "A crew on klique.", description: "People going to an event together. Sign in to see it.", eyebrow: "Crew", lines: [], image: null };
  }
}

/** A topic in a community's boards, if a signed-out visitor could read it; otherwise a plain card. */
export async function topicShare(slug: string, topicId: string): Promise<ShareInfo | null> {
  await connectDb();
  try {
    const { space, access } = await resolveSpaceFor(null, slug);
    const { topic: t } = await getTopic(null, space, access, topicId);
    const picture = t.media.find((m) => m.kind === "image")?.url ?? t.media.find((m) => m.poster)?.poster ?? t.community.coverImage;
    const comments = `${t.commentCount} ${t.commentCount === 1 ? "comment" : "comments"}`;
    return {
      title: t.title,
      description: `${t.body ? `${t.body.replace(/\s+/g, " ").slice(0, 160)} · ` : ""}${t.board.name} in ${t.community.name}`,
      eyebrow: `${t.community.name} · ${t.board.name}`,
      lines: [`by ${t.author.displayName}`, comments],
      image: picture,
    };
  } catch {
    return null;
  }
}

/** A person's profile, as a signed-out visitor sees it: a hidden profile shows only their name. */
export async function profileShare(handle: string): Promise<ShareInfo | null> {
  await connectDb();
  try {
    const v = await getProfile(null, handle);
    const p = v.profile;
    if (!v.visible) return { title: p.displayName, description: `@${p.handle} on klique.`, eyebrow: "Profile", lines: [`@${p.handle}`], image: null };
    const where = [p.neighborhood, placeLabel(p)].filter(Boolean).join(", ");
    return {
      title: p.displayName,
      description: p.bio ? p.bio.slice(0, 200) : `@${p.handle} on klique.${where ? ` ${where}.` : ""}`,
      eyebrow: "Profile",
      lines: [`@${p.handle}`, where, v.stats.communities ? `${v.stats.communities} ${v.stats.communities === 1 ? "community" : "communities"}` : ""],
      image: p.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

/** Klique's current fees, for the payment terms page (public). */
export async function publicFees(): Promise<{ donationFeePercent: number; contributionFeePercent: number; minPayout: number }> {
  await connectDb();
  const { getMoneyConfig } = await import("./money.service");
  return getMoneyConfig();
}
