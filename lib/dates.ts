/**
 * Date-range helpers for the "date" filter. Lagos and Abuja are both WAT
 * (UTC+1, no daylight saving), so day boundaries are a fixed 1h offset.
 */

const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateFilter = "any" | "today" | "tomorrow" | "weekend" | "week" | "month";
export const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: "any", label: "Any date" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "Next 30 days" },
];

/** UTC instant of 00:00 Lagos time on the day containing `d`. */
export function startOfLagosDay(d: Date): Date {
  const shifted = d.getTime() + WAT_OFFSET_MS;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStart - WAT_OFFSET_MS);
}

/** 0 = Sunday … 6 = Saturday, in Lagos time. */
function lagosWeekday(d: Date): number {
  return new Date(d.getTime() + WAT_OFFSET_MS).getUTCDay();
}

export function dateRangeFor(filter: DateFilter, now = new Date()): { from: Date; to: Date | null } {
  const today = startOfLagosDay(now);
  switch (filter) {
    case "today":
      return { from: now, to: new Date(today.getTime() + DAY_MS) };
    case "tomorrow":
      return { from: new Date(today.getTime() + DAY_MS), to: new Date(today.getTime() + 2 * DAY_MS) };
    case "weekend": {
      const wd = lagosWeekday(now); // 0 Sun … 6 Sat
      // Weekend = Friday 17:00 → Sunday 23:59 (Lagos). If it is already the weekend, start now.
      let friEvening: Date;
      if (wd === 6 || wd === 0) {
        friEvening = now;
      } else {
        const daysToFri = (5 - wd + 7) % 7;
        friEvening = new Date(today.getTime() + daysToFri * DAY_MS + 17 * 60 * 60 * 1000);
      }
      const daysToMonday = wd === 0 ? 1 : (8 - wd) % 7 || 7;
      const monday = new Date(today.getTime() + daysToMonday * DAY_MS);
      return { from: friEvening < now ? now : friEvening, to: monday };
    }
    case "week":
      return { from: now, to: new Date(today.getTime() + 7 * DAY_MS) };
    case "month":
      return { from: now, to: new Date(today.getTime() + 30 * DAY_MS) };
    default:
      return { from: now, to: null };
  }
}

export function isDateFilter(v: unknown): v is DateFilter {
  return typeof v === "string" && DATE_FILTERS.some((f) => f.id === v);
}
