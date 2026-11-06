/** For showing a community's growth stats, on the website and in the app. */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 0-23 → "6 PM" */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export function weekChange(now: number, before: number): string {
  if (!before) return now ? "None the week before" : "Quiet so far";
  const change = Math.round(((now - before) / before) * 100);
  return change === 0 ? "Same as last week" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on last week`;
}
