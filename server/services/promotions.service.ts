import { kliqueId } from "./klique-id";
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PromoteOptionsDTO, PromotionDTO } from "@/lib/types";
import { parseScope, scopeLabel } from "@/lib/places";
import { appUrl, paystackConfig, promotionPricePerDay, promotionReview } from "../env";
import { ApiError, badRequest, forbidden, notFound } from "../http/errors";
import { Ad, type IAd } from "../models/Ad";
import { Event, type IEvent } from "../models/Event";
import { Promotion, type IPromotion } from "../models/Promotion";
import type { IUser } from "../models/User";
import { sid } from "./helpers";

/**
 * Hosts paying to promote their own event. Flow: the host picks how long and how far → we create a pending
 * Promotion and a Paystack checkout → Paystack sends them back (and also calls our webhook) → we verify the
 * payment with Paystack and turn the promotion into a promoted-event Ad. Every step is safe to repeat.
 */

export const PROMO_DAYS = [3, 7, 14, 30];
const DISCOUNT: Record<number, number> = { 3: 0, 7: 0.05, 14: 0.1, 30: 0.2 };
const REACH: Record<string, { mult: number; hint: string }> = {
  city: { mult: 1, hint: "People browsing this city" },
  region: { mult: 1.5, hint: "The whole state, cities included" },
  country: { mult: 2.5, hint: "Everyone browsing this country" },
  world: { mult: 4, hint: "Everyone, everywhere (online events)" },
};
const PROMO_SLOTS: IAd["slots"] = ["home-feed", "events-list", "search"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Naira, rounded to ₦50. */
export function promotionPrice(reachScope: string, days: number): number {
  const level = parseScope(reachScope)?.level ?? "city";
  const mult = (REACH[level] ?? REACH.city).mult;
  return Math.round((promotionPricePerDay() * days * mult * (1 - (DISCOUNT[days] ?? 0))) / 50) * 50;
}

function reachesFor(e: IEvent): string[] {
  const out: string[] = [];
  if (e.online) out.push(`country:${e.country}`, "world");
  else {
    if (e.city) out.push(`city:${e.country}:${e.city}`);
    if (e.region) out.push(`region:${e.country}:${e.region}`);
    out.push(`country:${e.country}`);
  }
  return out.filter((s) => parseScope(s));
}

async function hostEvent(viewer: IUser, id: string): Promise<IEvent> {
  const e = await Event.findById(id).lean<IEvent>();
  if (!e) throw notFound("We couldn't find that event.");
  if (sid(e.hostId) !== sid(viewer._id)) throw forbidden("Only the host can promote this event.");
  return e;
}

function whyNot(e: IEvent, kliqueIdNow: string): string | null {
  if (!paystackConfig()) return "Promotions aren't available yet.";
  if (e.cancelled) return "This event was cancelled.";
  if (e.startsAt <= new Date()) return "This event has already started.";
  if (e.subcommunityId || !e.communityId || String(e.communityId) !== kliqueIdNow) return "Only Klique's own events can be promoted. A community's events are for its members.";
  return null;
}

async function toDtos(rows: IPromotion[]): Promise<PromotionDTO[]> {
  const ads = await Ad.find({ _id: { $in: rows.map((r) => r.adId).filter(Boolean) } }).lean<IAd[]>();
  const byId = new Map(ads.map((a) => [sid(a._id), a]));
  const now = new Date();
  return rows.map((p) => {
    const a = p.adId ? byId.get(sid(p.adId)) : undefined;
    const scope = parseScope(p.reach);
    return {
      id: sid(p._id),
      days: p.days,
      reach: p.reach,
      reachLabel: scope ? scopeLabel(scope) : p.reach,
      amount: p.amount / 100,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt?.toISOString() ?? null,
      ad: a
        ? {
            live: a.status === "active" && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now),
            pendingReview: a.pendingReview,
            startsAt: a.startsAt?.toISOString() ?? null,
            endsAt: a.endsAt?.toISOString() ?? null,
            impressions: a.impressions,
            clicks: a.clicks,
          }
        : null,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

export async function promoteOptions(viewer: IUser, eventId: string): Promise<PromoteOptionsDTO> {
  const e = await hostEvent(viewer, eventId);
  const reaches = reachesFor(e);
  const prices: PromoteOptionsDTO["prices"] = {};
  for (const r of reaches) prices[r] = Object.fromEntries(PROMO_DAYS.map((d) => [String(d), promotionPrice(r, d)]));
  const rows = await Promotion.find({ eventId: e._id, status: { $ne: "failed" } }).sort({ createdAt: -1 }).limit(20).lean<IPromotion[]>();
  const reason = whyNot(e, String(await kliqueId()));
  return {
    available: !reason,
    reason,
    event: { id: sid(e._id), title: e.title, startsAt: e.startsAt.toISOString() },
    currency: "NGN",
    days: PROMO_DAYS,
    reaches: reaches.map((r) => {
      const s = parseScope(r)!;
      return { scope: r, label: s.level === "world" ? "Everywhere" : scopeLabel(s), hint: REACH[s.level]?.hint ?? "" };
    }),
    prices,
    review: promotionReview(),
    promotions: await toDtos(rows.filter((r) => r.status === "paid")),
  };
}

export async function paystack<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const cfg = paystackConfig();
  if (!cfg) throw new ApiError(503, "Promotions aren't available yet.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) throw new ApiError(502, json?.message ? `Paystack: ${json.message}` : "Paystack didn't respond. Please try again.");
  return json.data as T;
}

/** Create the order and a Paystack checkout; the client sends the host to `authorizationUrl`. */
export async function startPromotion(viewer: IUser, eventId: string, input: { days: number; reach: string }) {
  const e = await hostEvent(viewer, eventId);
  const reason = whyNot(e, String(await kliqueId()));
  if (reason) throw badRequest(reason);
  if (!PROMO_DAYS.includes(input.days)) throw badRequest("Pick how many days to promote it for.");
  if (!reachesFor(e).includes(input.reach)) throw badRequest("Pick how far to promote it.");
  // never sell days after the event: a run that would outlast it is cut short, so don't charge for those days
  const daysLeft = Math.ceil((+e.startsAt - Date.now()) / DAY_MS);
  if (input.days > Math.max(daysLeft, 1)) throw badRequest(`The event starts in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Pick a shorter promotion.`);

  const amountKobo = promotionPrice(input.reach, input.days) * 100;
  const reference = `klq_${randomBytes(9).toString("hex")}`;
  await Promotion.create({ eventId: e._id, hostId: viewer._id, days: input.days, reach: input.reach, amount: amountKobo, currency: "NGN", reference });
  const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: viewer.email,
      amount: amountKobo,
      currency: "NGN",
      reference,
      callback_url: `${appUrl()}/events/${sid(e._id)}/promote`,
      metadata: { purpose: "event_promotion", eventId: sid(e._id), days: input.days, reach: input.reach, cancel_action: `${appUrl()}/events/${sid(e._id)}/promote` },
    },
  });
  return { authorizationUrl: data.authorization_url, reference };
}

/** Turn a paid promotion into a live ad (or one waiting for review). Safe to call any number of times. */
async function fulfil(reference: string, paid: { status: string; amount: number; currency: string; channel?: string; paid_at?: string }) {
  const p = await Promotion.findOne({ reference }).lean<IPromotion>();
  if (!p) return null;
  if (p.status === "paid") return p;
  if (paid.status !== "success") {
    // "abandoned" only means the checkout isn't finished yet; they can still pay with the same reference
    if (paid.status === "failed") await Promotion.updateOne({ _id: p._id, status: "pending" }, { status: "failed" });
    return p;
  }
  if (paid.currency !== p.currency || paid.amount < p.amount) {
    console.warn("[promotions] amount mismatch", reference, paid.amount, p.amount);
    return p;
  }
  // claim it, so the redirect and the webhook arriving together can't both create an ad
  // (a declined card followed by a successful retry on the same checkout still counts)
  const claimed = await Promotion.findOneAndUpdate({ _id: p._id, status: { $in: ["pending", "failed"] } }, { status: "paid", paidAt: paid.paid_at ? new Date(paid.paid_at) : new Date(), channel: paid.channel ?? "" }, { returnDocument: "after" }).lean<IPromotion>();
  if (!claimed) return Promotion.findById(p._id).lean<IPromotion>();

  const e = await Event.findById(p.eventId).select("title").lean<Pick<IEvent, "title">>();
  const review = promotionReview();
  const now = new Date();
  const ad = await Ad.create({
    name: `Paid: ${e?.title ?? "event"} · ${p.days}d`,
    kind: "event",
    status: review ? "paused" : "active",
    pendingReview: review,
    eventId: p.eventId,
    slots: PROMO_SLOTS,
    places: p.reach === "world" ? [] : [p.reach],
    interests: [],
    keywords: [],
    // with review on, the clock starts when an admin approves it
    startsAt: review ? null : now,
    endsAt: review ? null : new Date(+now + p.days * DAY_MS),
    weight: 6,
    promotionId: p._id,
    createdBy: p.hostId,
  });
  await Promotion.updateOne({ _id: p._id }, { adId: ad._id });
  return { ...claimed, adId: ad._id };
}

/** The host came back from Paystack: confirm with Paystack directly (never trust the redirect alone). */
export async function verifyPromotion(viewer: IUser, reference: string): Promise<PromotionDTO> {
  const p = await Promotion.findOne({ reference }).lean<IPromotion>();
  if (!p || sid(p.hostId) !== sid(viewer._id)) throw notFound("We couldn't find that payment.");
  if (p.status !== "paid") {
    const data = await paystack<{ status: string; amount: number; currency: string; channel?: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await fulfil(reference, data);
  }
  const fresh = await Promotion.findById(p._id).lean<IPromotion>();
  return (await toDtos([fresh!]))[0];
}

/** Paystack's server-to-server notification. Checked with the HMAC signature Paystack sends. */
export async function handlePaystackWebhook(rawBody: string, signature: string | null) {
  const cfg = paystackConfig();
  if (!cfg || !signature) return false;
  const expected = createHmac("sha512", cfg.secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const evt = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
  if (evt.event === "charge.success" && evt.data?.reference) {
    // re-check with Paystack rather than trusting the payload's numbers
    const data = await paystack<{ status: string; amount: number; currency: string; channel?: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(evt.data.reference)}`);
    // ad requests (kad_…) start their run; event promotions (klq_…) as before
    if (evt.data.reference.startsWith("kad_")) await (await import("./ad-campaigns.service")).fulfilCampaign(evt.data.reference, data);
    // points packs (kpt_…)
    else if (evt.data.reference.startsWith("kpt_")) await (await import("./points.service")).fulfilPointPurchase(evt.data.reference, data);
    else await fulfil(evt.data.reference, data);
  }
  return true;
}

/** Approving a paid promotion that was waiting for review starts its run from now. */
export async function startReviewedRun(ad: IAd) {
  if (!ad.pendingReview || !ad.promotionId) return;
  const p = await Promotion.findById(ad.promotionId).lean<IPromotion>();
  const now = new Date();
  await Ad.updateOne({ _id: ad._id }, { pendingReview: false, startsAt: now, endsAt: new Date(+now + (p?.days ?? 7) * DAY_MS) });
}
