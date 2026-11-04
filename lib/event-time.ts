/**
 * When an event is over, the same everywhere (cards, the event page, notifications, RSVPs on the server): at its
 * end time, or 3 hours after it starts when it has none. While it's on (started, not ended) people can still go.
 */
export const EVENT_FALLBACK_MS = 3 * 60 * 60 * 1000;

type When = { startsAt: Date | string; endsAt?: Date | string | null };

/** The moment it's over (ms). */
export const eventEndMs = (e: When): number => (e.endsAt ? +new Date(e.endsAt) : +new Date(e.startsAt) + EVENT_FALLBACK_MS);

/** Over already? */
export const eventEnded = (e: When, now = Date.now()): boolean => eventEndMs(e) < now;
