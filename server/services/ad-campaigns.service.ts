import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { z } from "zod";
import { AD_PLACEMENTS, adPrice, pricingOf, type AdPlacement, type AdPricing } from "@/lib/ads";
import { parseScope, scopeLabel } from "@/lib/places";
import type { AdCampaignDTO, AdCampaignPhase } from "@/lib/types";
import { adminEmails, appUrl, paystackConfig } from "../env";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { rateLimit } from "../http/rate-limit";
import { Ad, type IAd } from "../models/Ad";
import { AdCampaign, type IAdCampaign } from "../models/AdCampaign";
import { AppSetting } from "../models/AppSetting";
import { Community, type ICommunity } from "../models/Community";
import { Event, type IEvent } from "../models/Event";
import { Membership } from "../models/Membership";
import { User, type IUser } from "../models/User";
import { GHOST, loadBriefs } from "../serializers";
import type { adCampaignSchema, adPricingSchema } from "../validators/schemas";
import { assertVerified } from "./account.service";
import { sid } from "./helpers";
import { isKlique, kliqueId } from "./klique-id";
import { paystack } from "./promotions.service";
import { notify, notifyNow } from "./push.service";

/**
 * Ads people ask for. Anyone signed in (with a verified email) can submit one: promote an event they host,
 * a community they run, or their own ad (picture, headline, link). A site admin approves it, asks for changes,
 * or turns it down. Once approved they pay (card through Paystack, or an admin marks it paid for a transfer),
 * and it runs for the days they bought in the placements they chose, then ends. The price is always worked
 * out here from the admin's price list, never taken from the browser.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PRICING_KEY = "adPricing";

/* ------------------------------ pricing ------------------------------ */

export async function getAdPricing(): Promise<AdPricing> {
  const row = await AppSetting.findById(PRICING_KEY).lean();
  return pricingOf(row?.value);
}

export async function setAdPricing(input: z.infer<typeof adPricingSchema>): Promise<AdPricing> {
  const now = await getAdPricing();
  const next = pricingOf({ ...now, ...input, perDay: { ...now.perDay, ...(input.perDay ?? {}) }, reach: { ...now.reach, ...(input.reach ?? {}) } });
  if (next.minDays > next.maxDays) throw badRequest("The shortest run can't be longer than the longest.");
  await AppSetting.updateOne({ _id: PRICING_KEY }, { $set: { value: next } }, { upsert: true });
  return next;
}

/* ------------------------------- shape ------------------------------- */

function phaseOf(c: Pick<IAdCampaign, "status" | "startsAt" | "endsAt">, now = Date.now()): AdCampaignPhase {
  if (c.status !== "paid") return c.status;
  if (c.startsAt && +c.startsAt > now) return "scheduled";
  if (c.endsAt && +c.endsAt <= now) return "ended";
  return "live";
}

const placeLabelOf = (c: Pick<IAdCampaign, "reach" | "place">) => {
  if (c.reach === "world" || !c.place) return "Everywhere";
  const s = parseScope(c.place);
  return s ? scopeLabel(s) : c.place;
};

async function toDtos(rows: IAdCampaign[], withUser = false): Promise<AdCampaignDTO[]> {
  const [events, communities, ads, users] = await Promise.all([
    Event.find({ _id: { $in: rows.map((r) => r.eventId).filter(Boolean) } }).select("title startsAt coverImage").lean<Pick<IEvent, "_id" | "title" | "startsAt" | "coverImage">[]>(),
    Community.find({ _id: { $in: rows.map((r) => r.communityId).filter(Boolean) } }).select("slug name coverImage").lean<Pick<ICommunity, "_id" | "slug" | "name" | "coverImage">[]>(),
    Ad.find({ _id: { $in: rows.map((r) => r.adId).filter(Boolean) } }).select("impressions clicks").lean<Pick<IAd, "_id" | "impressions" | "clicks">[]>(),
    withUser ? loadBriefs(rows.map((r) => r.userId)) : Promise.resolve(new Map()),
  ]);
  const ev = new Map(events.map((e) => [sid(e._id), e]));
  const co = new Map(communities.map((c) => [sid(c._id), c]));
  const ad = new Map(ads.map((a) => [sid(a._id), a]));
  const online = !!paystackConfig();
  return rows.map((c) => {
    const e = c.eventId ? ev.get(sid(c.eventId)) : undefined;
    const k = c.communityId ? co.get(sid(c.communityId)) : undefined;
    const a = c.adId ? ad.get(sid(c.adId)) : undefined;
    return {
      id: sid(c._id),
      kind: c.kind,
      status: c.status,
      phase: phaseOf(c),
      advertiser: c.advertiser,
      title: c.title,
      body: c.body,
      imageUrl: c.imageUrl,
      ctaLabel: c.ctaLabel,
      url: c.url,
      event: e ? { id: sid(e._id), title: e.title, startsAt: e.startsAt.toISOString(), coverImage: e.coverImage } : null,
      community: k ? { slug: k.slug, name: k.name, coverImage: k.coverImage } : null,
      placements: c.placements,
      reach: c.reach,
      place: c.place,
      placeLabel: placeLabelOf(c),
      days: c.days,
      startOn: c.startOn?.toISOString() ?? null,
      amount: c.amount,
      currency: c.currency,
      reviewNote: c.reviewNote,
      paymentMethod: c.paymentMethod,
      paidAt: c.paidAt?.toISOString() ?? null,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      impressions: a?.impressions ?? 0,
      clicks: a?.clicks ?? 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      ...(withUser ? { user: users.get(sid(c.userId)) ?? GHOST } : {}),
      canPayOnline: online,
    };
  });
}

/* ----------------------------- submitting ----------------------------- */

const httpUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const count = (n: number, word: string) => `${n.toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;
const dateLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Check what's being promoted and that this person may promote it; returns the fields to store. */
async function cleanInput(viewer: IUser, input: z.infer<typeof adCampaignSchema>, pricing: AdPricing): Promise<Partial<IAdCampaign>> {
  const placements = [...new Set(input.placements)].filter((p): p is AdPlacement => AD_PLACEMENTS.some((x) => x.id === p));
  if (!placements.length) throw badRequest("Pick at least one place on Klique for your ad.");
  if (input.days < pricing.minDays || input.days > pricing.maxDays) throw badRequest(`Ads run for ${pricing.minDays} to ${pricing.maxDays} days.`);
  let place: string | null = null;
  if (input.reach !== "world") {
    const s = parseScope(input.place);
    if (!s || s.level !== input.reach) throw badRequest(input.reach === "city" ? "Pick the city your ad shows in." : "Pick the country your ad shows in.");
    place = input.place!;
  }
  const startOn = input.startOn ? new Date(input.startOn) : null;
  if (startOn && +startOn < Date.now() - DAY_MS) throw badRequest("Pick a start date that hasn't passed.");

  const base: Partial<IAdCampaign> = { kind: input.kind, placements, reach: input.reach, place, days: input.days, startOn, eventId: null, communityId: null };

  if (input.kind === "event") {
    const e = input.eventId && Types.ObjectId.isValid(input.eventId) ? await Event.findById(input.eventId).lean<IEvent>() : null;
    if (!e) throw badRequest("Pick the event to promote.");
    let mine = sid(e.hostId) === sid(viewer._id);
    if (!mine && e.communityId) mine = !!(await Membership.exists({ userId: viewer._id, communityId: e.communityId, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } }));
    if (!mine) throw forbidden("You can promote events you host, or events in a community you run.");
    // A community's events are for its members only, so advertising one to everyone would break that: only
    // Klique's own events (which everyone sees anyway) can be. Communities can advertise themselves instead.
    if (e.subcommunityId || !e.communityId || String(e.communityId) !== String(await kliqueId())) throw badRequest("Only Klique's own events can be advertised: a community's events are for its members. Promote the community instead, and people who join will see its events.");
    if (e.cancelled) throw badRequest("This event was cancelled.");
    const daysLeft = Math.ceil((+e.startsAt - Math.max(Date.now(), +(startOn ?? 0))) / DAY_MS);
    if (daysLeft < 1) throw badRequest("This event starts too soon to advertise it.");
    if (input.days > daysLeft) throw badRequest(`The event starts in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Pick ${daysLeft} or fewer.`);
    return { ...base, eventId: e._id, advertiser: "", title: e.title, body: "", imageUrl: e.coverImage, ctaLabel: "See event", url: "" };
  }
  if (input.kind === "community") {
    const c = input.communitySlug ? await Community.findOne({ slug: input.communitySlug.toLowerCase() }).lean<ICommunity>() : null;
    if (!c) throw badRequest("Pick the community to promote.");
    const runs = await Membership.exists({ userId: viewer._id, communityId: c._id, subcommunityId: null, status: "active", role: { $in: ["owner", "admin"] } });
    if (!runs) throw forbidden("You can promote communities you own or run.");
    if (c.privacy !== "public") throw badRequest("Only public communities can be advertised.");
    if (isKlique(c)) throw badRequest("Everyone's already in Klique.");
    return {
      ...base,
      communityId: c._id,
      advertiser: c.name,
      title: (input.title ?? "").trim() || `Join ${c.name}`,
      body: (input.body ?? "").trim() || c.description.slice(0, 200),
      imageUrl: c.coverImage,
      ctaLabel: "Join",
      url: `${appUrl()}/communities/${c.slug}`,
    };
  }
  const url = httpUrl((input.url ?? "").trim());
  if (!url) throw badRequest("Add the link your ad opens, starting with https://");
  const title = (input.title ?? "").trim();
  const advertiser = (input.advertiser ?? "").trim();
  if (!title) throw badRequest("Add a headline.");
  if (!advertiser) throw badRequest("Add who the ad is from. It's shown next to \"Sponsored\".");
  return { ...base, advertiser, title, body: (input.body ?? "").trim(), imageUrl: input.imageUrl ? httpUrl(input.imageUrl) : null, ctaLabel: (input.ctaLabel ?? "").trim() || "Learn more", url };
}

async function siteAdminIds(): Promise<Types.ObjectId[]> {
  const emails = [...adminEmails()];
  if (!emails.length) return [];
  return (await User.find({ email: { $in: emails } }).select("_id").lean<{ _id: Types.ObjectId }[]>()).map((u) => u._id);
}

function tellAdmins(viewer: IUser, c: Pick<IAdCampaign, "title" | "amount">) {
  void siteAdminIds().then((ids) =>
    notify(ids, { title: `${viewer.displayName} sent an ad for review`, body: `${c.title} · ₦${c.amount.toLocaleString("en-NG")}`, data: { href: "/admin/ads?view=requests" } }, { category: "admin", groupKey: "ad-review", many: (n) => `${n} ads waiting for review`, ref: "ad-review" }),
  );
}

export async function submitCampaign(viewer: IUser, input: z.infer<typeof adCampaignSchema>): Promise<AdCampaignDTO> {
  assertVerified(viewer);
  rateLimit(`ad-submit:${sid(viewer._id)}`, 10, DAY_MS);
  const pricing = await getAdPricing();
  const fields = await cleanInput(viewer, input, pricing);
  const amount = adPrice(pricing, fields.placements!, fields.reach!, fields.days!);
  const doc = await AdCampaign.create({ ...fields, userId: viewer._id, amount, currency: "NGN", status: "pending" });
  tellAdmins(viewer, doc);
  return (await toDtos([doc.toObject()]))[0];
}

async function myCampaign(viewer: IUser, id: string): Promise<IAdCampaign> {
  const c = Types.ObjectId.isValid(id) ? await AdCampaign.findById(id).lean<IAdCampaign>() : null;
  if (!c || sid(c.userId) !== sid(viewer._id)) throw notFound("We couldn't find that ad.");
  return c;
}

export async function listMyCampaigns(viewer: IUser): Promise<AdCampaignDTO[]> {
  return toDtos(await AdCampaign.find({ userId: viewer._id }).sort({ createdAt: -1 }).limit(100).lean<IAdCampaign[]>());
}

export async function getMyCampaign(viewer: IUser, id: string): Promise<AdCampaignDTO> {
  return (await toDtos([await myCampaign(viewer, id)]))[0];
}

/** Edit an ad that hasn't been paid for yet; it goes back to the admins for review. */
export async function updateCampaign(viewer: IUser, id: string, input: z.infer<typeof adCampaignSchema>): Promise<AdCampaignDTO> {
  const c = await myCampaign(viewer, id);
  if (!["pending", "changes", "rejected", "approved"].includes(c.status)) throw conflict("This ad is already paid for, so it can't be changed.");
  const pricing = await getAdPricing();
  const fields = await cleanInput(viewer, input, pricing);
  const amount = adPrice(pricing, fields.placements!, fields.reach!, fields.days!);
  // a changed ad can cost something else, so the next payment starts a fresh checkout
  await AdCampaign.updateOne({ _id: c._id }, { $set: { ...fields, amount, status: "pending", reviewNote: "", reviewedBy: null, reviewedAt: null, paymentRef: null, paymentUrl: null } });
  tellAdmins(viewer, { title: fields.title ?? c.title, amount });
  return getMyCampaign(viewer, id);
}

export async function cancelCampaign(viewer: IUser, id: string): Promise<AdCampaignDTO> {
  const c = await myCampaign(viewer, id);
  if (c.status === "paid") throw conflict("This ad is paid for. Contact us if you need to stop it.");
  await AdCampaign.updateOne({ _id: c._id }, { $set: { status: "cancelled" } });
  return getMyCampaign(viewer, id);
}

/* ------------------------------ paying ------------------------------ */

/** Approved ads only: create a Paystack checkout. The browser sends them to `authorizationUrl`. */
export async function payCampaign(viewer: IUser, id: string): Promise<{ authorizationUrl: string; reference: string }> {
  const c = await myCampaign(viewer, id);
  if (c.status !== "approved") throw conflict(c.status === "paid" ? "This ad is already paid for." : "You can pay once an admin has approved your ad.");
  if (!paystackConfig()) throw badRequest("Card payments aren't set up yet. An admin will tell you how to pay by transfer.");
  // Paying again (they closed the checkout, or came back later): Paystack won't open a second checkout with the
  // same reference, so check the first one went through, and if not send them back to that same checkout.
  if (c.paymentRef && c.paymentUrl) {
    const prev = await paystack<{ status: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(c.paymentRef)}`).catch(() => null);
    if (prev?.status === "success") {
      await fulfilCampaign(c.paymentRef, prev);
      throw conflict("This ad is already paid for. It's starting now.");
    }
    return { authorizationUrl: c.paymentUrl, reference: c.paymentRef };
  }
  const reference = `kad_${randomBytes(9).toString("hex")}`;
  await AdCampaign.updateOne({ _id: c._id }, { $set: { paymentRef: reference } });
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: viewer.email,
      amount: c.amount * 100,
      currency: "NGN",
      reference,
      callback_url: `${appUrl()}/ads`,
      metadata: { purpose: "ad_campaign", campaignId: sid(c._id), cancel_action: `${appUrl()}/ads` },
    },
  });
  await AdCampaign.updateOne({ _id: c._id }, { $set: { paymentUrl: data.authorization_url } });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Turn a paid ad request into a running ad. Safe to call any number of times. */
async function startRun(c: IAdCampaign, method: "paystack" | "manual", paidAt = new Date()): Promise<void> {
  const claimed = await AdCampaign.findOneAndUpdate({ _id: c._id, status: "approved" }, { $set: { status: "paid", paymentMethod: method, paidAt } }, { new: true }).lean<IAdCampaign>();
  if (!claimed) return; // already started (the webhook and the redirect arriving together)
  const now = Date.now();
  const startsAt = new Date(Math.max(now, +(claimed.startOn ?? 0)));
  const endsAt = new Date(+startsAt + claimed.days * DAY_MS);
  const ad = await Ad.create({
    name: `${claimed.kind === "event" ? "Event" : claimed.kind === "community" ? "Community" : "Ad"}: ${claimed.title} · ${claimed.days}d`,
    kind: claimed.kind === "event" ? "event" : "brand",
    status: "active",
    eventId: claimed.eventId,
    advertiser: claimed.advertiser,
    title: claimed.title,
    body: claimed.body,
    imageUrl: claimed.imageUrl,
    ctaLabel: claimed.ctaLabel,
    url: claimed.url,
    slots: claimed.placements,
    places: claimed.reach === "world" || !claimed.place ? [] : [claimed.place],
    interests: [],
    keywords: [],
    startsAt,
    endsAt,
    weight: 6,
    campaignId: claimed._id,
    createdBy: claimed.userId,
  });
  await AdCampaign.updateOne({ _id: claimed._id }, { $set: { adId: ad._id, startsAt, endsAt } });
  const live = +startsAt <= now + 60_000;
  notify(
    [claimed.userId],
    {
      title: live ? `Your ad is live: ${claimed.title}` : `Your ad is booked: ${claimed.title}`,
      body: live ? `It runs until ${dateLabel(endsAt)}.` : `It starts ${dateLabel(startsAt)} and runs until ${dateLabel(endsAt)}.`,
      data: { href: "/ads" },
    },
    { category: "ads", ref: `ad:${sid(claimed._id)}` },
  );
}

/** Paystack's answer for a checkout (from the redirect or the webhook): start the ad if it's fully paid. */
export async function fulfilCampaign(reference: string, paid: { status: string; amount: number; currency: string; paid_at?: string }) {
  const c = await AdCampaign.findOne({ paymentRef: reference }).lean<IAdCampaign>();
  if (!c || paid.status !== "success") return;
  if (paid.currency !== c.currency || paid.amount < c.amount * 100) {
    console.warn("[ads] amount mismatch", reference, paid.amount, c.amount * 100);
    return;
  }
  await startRun(c, "paystack", paid.paid_at ? new Date(paid.paid_at) : new Date());
}

/** They came back from Paystack: confirm with Paystack directly (never trust the redirect alone). */
export async function verifyCampaignPayment(viewer: IUser, reference: string): Promise<AdCampaignDTO> {
  const c = await AdCampaign.findOne({ paymentRef: reference }).lean<IAdCampaign>();
  if (!c || sid(c.userId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (c.status === "approved") {
    const data = await paystack<{ status: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfilCampaign(reference, data);
  }
  return getMyCampaign(viewer, sid(c._id));
}

/* ------------------------------ admins ------------------------------ */

export async function adminListCampaigns(status: "review" | "approved" | "running" | "all"): Promise<AdCampaignDTO[]> {
  const want: Record<string, IAdCampaign["status"] | undefined> = { review: "pending", approved: "approved", running: "paid" };
  const filter = want[status] ? { status: want[status] } : {};
  return toDtos(await AdCampaign.find(filter).sort({ createdAt: status === "review" ? 1 : -1 }).limit(200).lean<IAdCampaign[]>(), true);
}

export const pendingCampaignCount = () => AdCampaign.countDocuments({ status: "pending" });

export async function reviewCampaign(admin: IUser, id: string, action: "approve" | "changes" | "reject" | "mark-paid", note = ""): Promise<AdCampaignDTO> {
  const c = Types.ObjectId.isValid(id) ? await AdCampaign.findById(id).lean<IAdCampaign>() : null;
  if (!c) throw notFound("That ad request is gone.");
  const ref = `ad:${sid(c._id)}`;
  if (action === "mark-paid") {
    if (c.status !== "approved" && c.status !== "pending") throw conflict("Only approved ads waiting for payment can be marked paid.");
    if (c.status === "pending") await AdCampaign.updateOne({ _id: c._id }, { $set: { status: "approved", reviewedBy: admin._id, reviewedAt: new Date() } });
    await startRun({ ...c, status: "approved" }, "manual");
  } else {
    if (c.status !== "pending" && !(action === "reject" && c.status === "approved")) throw conflict("This ad was already reviewed.");
    if (action !== "approve" && !note.trim()) throw badRequest("Tell them why, so they know what to change.");
    const status = action === "approve" ? "approved" : action === "changes" ? "changes" : "rejected";
    await AdCampaign.updateOne({ _id: c._id }, { $set: { status, reviewNote: note.trim(), reviewedBy: admin._id, reviewedAt: new Date() } });
    const msg =
      action === "approve"
        ? { title: `Your ad was approved: ${c.title}`, body: paystackConfig() ? `Pay ₦${c.amount.toLocaleString("en-NG")} to start it.` : "We'll be in touch about payment." }
        : action === "changes"
          ? { title: `Your ad needs a change: ${c.title}`, body: note.trim() }
          : { title: `Your ad wasn't approved: ${c.title}`, body: note.trim() };
    notify([c.userId], { ...msg, data: { href: "/ads" } }, { category: "ads", ref });
  }
  return (await toDtos([(await AdCampaign.findById(c._id).lean<IAdCampaign>())!], true))[0];
}

/* ---------------------------- along the way ---------------------------- */

/** "Ends tomorrow" a day before, and "ended" with its results afterwards. Runs with the reminder job. */
export async function runAdLifecycle(now = new Date()): Promise<number> {
  let sent = 0;
  const soon = await AdCampaign.find({ status: "paid", endingSoonSentAt: null, endsAt: { $gt: now, $lte: new Date(+now + DAY_MS) } }).limit(100).lean<IAdCampaign[]>();
  for (const c of soon) {
    const claimed = await AdCampaign.updateOne({ _id: c._id, endingSoonSentAt: null }, { $set: { endingSoonSentAt: now } });
    if (!claimed.modifiedCount || c.days < 2) continue; // a one-day ad doesn't need a warning
    await notifyNow([c.userId], { title: `Your ad ends tomorrow: ${c.title}`, body: "Want it to keep running? Send it again from Your ads.", data: { href: "/ads" } }, { category: "ads", ref: `ad:${sid(c._id)}` });
    sent++;
  }
  const done = await AdCampaign.find({ status: "paid", endedSentAt: null, endsAt: { $lte: now } }).limit(100).lean<IAdCampaign[]>();
  for (const c of done) {
    const claimed = await AdCampaign.updateOne({ _id: c._id, endedSentAt: null }, { $set: { endedSentAt: now } });
    if (!claimed.modifiedCount) continue;
    const a = c.adId ? await Ad.findById(c.adId).select("impressions clicks").lean<Pick<IAd, "impressions" | "clicks">>() : null;
    await notifyNow(
      [c.userId],
      { title: `Your ad has ended: ${c.title}`, body: `${count(a?.impressions ?? 0, "view")}, ${count(a?.clicks ?? 0, "tap")}.`, data: { href: "/ads" } },
      { category: "ads", ref: `ad:${sid(c._id)}` },
    );
    sent++;
  }
  return sent;
}
