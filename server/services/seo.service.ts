import "server-only";
import { placeLabel } from "@/lib/places";
import { connectDb } from "../db";
import { appUrl } from "../env";
import { getCommunity } from "./communities.service";
import { getEvent } from "./events.service";

/**
 * What search engines read straight from a page's HTML (schema.org, as JSON-LD): the facts of a public event or a
 * public community, so Google can list them (events show in its event listings) without running the page. Only what
 * a signed-out visitor could see: anything private, 18+, unapproved or missing gives nothing.
 */

const abs = (u: string | null | undefined) => (!u ? null : /^https?:\/\//.test(u) ? u : `${appUrl().replace(/\/$/, "")}${u.startsWith("/") ? "" : "/"}${u}`);

export async function eventJsonLd(id: string): Promise<Record<string, unknown> | null> {
  await connectDb();
  try {
    const e = await getEvent(null, id);
    if (e.review || e.audience !== "public") return null;
    const base = appUrl().replace(/\/$/, "");
    const url = `${base}/events/${e.id}`;
    const place = placeLabel(e);
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      description: e.description.slice(0, 500) || `${e.title} in ${place}.`,
      startDate: e.startsAt,
      ...(e.endsAt ? { endDate: e.endsAt } : {}),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: e.online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
      location: e.online
        ? { "@type": "VirtualLocation", url }
        : { "@type": "Place", name: e.venue || place, address: { "@type": "PostalAddress", ...(e.neighborhood ? { streetAddress: e.neighborhood } : {}), addressLocality: place, ...(e.region ? { addressRegion: e.region } : {}), addressCountry: e.country } },
      ...(abs(e.coverImage) ? { image: [abs(e.coverImage)] } : {}),
      url,
      organizer: e.organizer
        ? { "@type": "Organization", name: e.organizer.name, ...(e.organizer.url ? { url: e.organizer.url } : {}) }
        : e.community
          ? { "@type": "Organization", name: e.community.name, url: `${base}/communities/${e.community.slug}` }
          : { "@type": "Person", name: e.host.displayName },
      ...(e.priceNaira !== null
        ? { offers: { "@type": "Offer", price: e.priceNaira, priceCurrency: e.currency || "NGN", availability: e.isFull ? "https://schema.org/SoldOut" : "https://schema.org/InStock", url: e.ticketUrl || url } }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function communityJsonLd(slug: string): Promise<Record<string, unknown> | null> {
  await connectDb();
  try {
    const c = await getCommunity(null, slug);
    if (c.adult || c.privacy !== "public") return null;
    const url = `${appUrl().replace(/\/$/, "")}/communities/${c.slug}`;
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: c.name,
      url,
      ...(c.description ? { description: c.description.slice(0, 500) } : {}),
      ...(abs(c.coverImage) ? { logo: abs(c.coverImage), image: abs(c.coverImage) } : {}),
      address: { "@type": "PostalAddress", addressLocality: placeLabel(c), addressCountry: c.country },
    };
  } catch {
    return null;
  }
}
