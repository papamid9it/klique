import { z } from "zod";
import { botJson, botRoute } from "@/server/http/bot-api";
import { Event } from "@/server/models/Event";
import { assertBotPostsEvents, botIn } from "@/server/services/bots.service";
import { createEvent } from "@/server/services/events.service";
import { eventCreateSchema } from "@/server/validators/schemas";
import { appUrl } from "@/server/env";

const https = z.string().trim().max(600).url().refine((u) => u.startsWith("https://"), "Use an https link.");

/** An event, in the bot API's words. Place and interest default to the community's. */
const body = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(4000).optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  /** the IANA zone the times are in, e.g. "Africa/Lagos" */
  time_zone: z.string().trim().max(64).optional(),
  venue: z.string().trim().max(160).optional(),
  online: z.boolean().optional(),
  online_url: https.optional(),
  country: z.string().trim().length(2).optional(),
  region: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  interest: z.string().trim().max(40).optional(),
  /** in whole units of the currency; 0 is free; leave it out when it isn't known */
  price: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  /** the cover picture */
  image: https.optional(),
  /** tickets or more information */
  link: https.optional(),
  link_label: z.string().trim().max(30).optional(),
  /** who's putting it on, shown on the event */
  organizer: z.string().trim().max(120).optional(),
});

/**
 * Add an event to a community, if the community lets this bot post events ("Post events" in its bot settings). It's
 * live at once, hosted by the bot, and members get the usual "New event" notification.
 */
export const POST = botRoute<{ communityId: string }>(async ({ req, params, app, bot }) => {
  const e = await botJson(req, body);
  const { space } = await botIn(bot, params.communityId);
  const c = space.community;
  await assertBotPostsEvents(app, c._id);
  const online = !!e.online;
  const input = eventCreateSchema.parse({
    title: e.title,
    description: e.description ?? "",
    interest: e.interest || c.interest,
    country: (e.country || c.country || "NG").toUpperCase(),
    region: e.region || c.region || undefined,
    city: e.city || c.city,
    venue: online ? "Online" : e.venue,
    online,
    onlineUrl: online ? (e.online_url ?? null) : null,
    startsAt: e.starts_at,
    endsAt: e.ends_at ?? null,
    timeZone: e.time_zone,
    priceNaira: e.price ?? null,
    currency: e.currency?.toUpperCase(),
    coverImage: e.image ?? null,
    ticketUrl: e.link ?? null,
    ticketLabel: e.link_label,
    communitySlug: c.slug,
  });
  const ev = await createEvent(bot, input, { trustedBot: true });
  if (e.organizer || e.link) await Event.updateOne({ _id: ev.id }, { $set: { ...(e.organizer ? { organizerName: e.organizer } : {}), ...(e.link ? { sourceUrl: e.link } : {}) } });
  return { id: ev.id, url: `${appUrl()}/events/${ev.id}`, title: ev.title, starts_at: ev.startsAt };
});
